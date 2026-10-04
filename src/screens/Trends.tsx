import { useEffect, useState } from 'react'
import { WHY_ORDER, type Reading } from '../../supabase/functions/_shared/briefing'
import { wording } from '../../supabase/functions/_shared/wording'
import { HeartIcon, MoonIcon, PulseIcon } from '../components/Icons'
import { cssName } from '../components/MiniChart'
import NavBar from '../components/NavBar'
import TrendChart from '../components/TrendChart'
import { loadTrends, type TrendData } from '../lib/trends'
import { localDate } from '../lib/when'

const t = wording.trends
const ICONS: Record<Reading, typeof PulseIcon> = { hrv: PulseIcon, sleep: MoonIcon, sleeping_hr: HeartIcon }

// "See your trends" (R44 to R46): one chart per score reading, 8 weeks.
export default function Trends() {
  const [data, setData] = useState<TrendData | null>(null)
  const [failed, setFailed] = useState(false)

  async function load() {
    try {
      setData(await loadTrends(localDate(new Date())))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <main className="page trends">
      <NavBar title={t.title} />
      <p className="caption date-line">{t.period}</p>
      {!data && !failed && <section className="card loading" aria-busy="true" />}
      {!data && failed && (
        <section className="card">
          <p className="body">{wording.card.loadFailed}</p>
          <button className="text-button" type="button" onClick={load}>
            {wording.card.retry}
          </button>
        </section>
      )}
      {data &&
        WHY_ORDER.map((r) => {
          const Icon = ICONS[r]
          const points = data.series[r]
          const last = points[points.length - 1]
          return (
            <section key={r} className={`card reading reading-${cssName(r)}`} aria-labelledby={`trend-${r}`}>
              <h2 id={`trend-${r}`} className="reading-name">
                <Icon />
                {wording.why.titles[r]}
              </h2>
              {last.building && <p className="caption">{t.building(last.validNights, data.minValid[r] ?? 21)}</p>}
              <TrendChart reading={r} points={points} label={t.chartLabel(wording.why.names[r])} />
              <p className="caption">{t.legend}</p>
            </section>
          )
        })}
    </main>
  )
}
