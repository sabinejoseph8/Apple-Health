import { useEffect, useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import { Loading, LoadFailed } from '../components/LoadState'
import NavBar from '../components/NavBar'
import { supabase } from '../lib/supabase'
import { formatWhen } from '../lib/when'

const w = wording.owner
// The Pro plan includes 8 GB (D90, 9 October 2026); the warning comes at 80%, as it did on the free plan's 500 MB.
const ALERT_MB = 0.8 * 8 * 1024

interface Person {
  name: string
  is_owner: boolean
  last_sync: string | null
  reminder_days: string[]
  reminders_in_a_row: boolean
  failures: number
  import_months: number | null
}

interface Status {
  database_mb: number
  people: Person[]
}

// The owner's page (R64): for each person, syncs, reminders, failures and
// import progress, and how full the database is. Never a reading. The
// database refuses anyone but the owner (owner_status).
export default function Owner() {
  const [status, setStatus] = useState<Status | null>(null)
  const [refused, setRefused] = useState(false)
  const [failed, setFailed] = useState(false)

  async function load() {
    const { data, error } = await supabase.rpc('owner_status')
    if (error) {
      if (error.code === '42501') setRefused(true)
      else setFailed(true)
      return
    }
    setStatus(data as Status)
    setFailed(false)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <main className="page owner">
      <NavBar title={w.title} />
      {refused && (
        <section className="card">
          <p className="body">{w.notOwner}</p>
        </section>
      )}
      {failed && <LoadFailed onRetry={load} />}
      {!status && !refused && !failed && <Loading />}
      {status && (
        <>
          <section className="card" aria-labelledby="owner-project">
            <h2 id="owner-project" className="card-title">
              {w.projectHeading}
            </h2>
            <p className="body">{w.database(String(status.database_mb))}</p>
            {status.database_mb >= ALERT_MB && <p className="body warn">{w.databaseHigh}</p>}
          </section>
          {status.people.map((p, i) => (
            <section key={i} className="card person" aria-label={p.name}>
              <div className="status-row">
                <h2 className="card-title person-name">{p.name}</h2>
                {p.is_owner && <span className="pill">{w.you}</span>}
              </div>
              <p className="body">{p.last_sync ? w.lastSync(formatWhen(p.last_sync)) : w.noSync}</p>
              <p className="body">{w.reminders(p.reminder_days.length)}</p>
              {p.reminders_in_a_row && <p className="body warn">{w.inARow}</p>}
              <p className={p.failures > 0 ? 'body warn' : 'body'}>{w.failures(p.failures)}</p>
              <p className="body">
                {p.import_months === null ? w.importNone : p.import_months >= 12 ? w.importAll : w.importSome(p.import_months)}
              </p>
            </section>
          ))}
        </>
      )}
    </main>
  )
}
