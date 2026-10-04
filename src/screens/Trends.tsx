import { useEffect, useState } from 'react'
import { WHY_ORDER, type Reading } from '../../supabase/functions/_shared/briefing'
import { wording } from '../../supabase/functions/_shared/wording'
import { HeartIcon, MoonIcon, PulseIcon } from '../components/Icons'
import { cssName } from '../components/MiniChart'
import NavBar from '../components/NavBar'
import TrendChart from '../components/TrendChart'
import { Loading, LoadFailed } from '../components/LoadState'
import { loadTrends, type TrendData } from '../lib/trends'
import { logUsage } from '../lib/today'
import { localDate } from '../lib/when'

const t = wording.trends
const ICONS: Record<Reading, typeof PulseIcon> = { hrv: PulseIcon, sleep: MoonIcon, sleeping_hr: HeartIcon }

// "See your trends" (R44 to R46): one chart per score reading, 8 weeks.
export default function Trends() {
  const [data, setData] = useState<TrendData | null>(null)
  const [failed, setFailed] = useState(false)

  async function load() {
    try {
      const today = localDate(new Date())
      setData(await loadTrends(today))
      setFailed(false)
      logUsage('trends_open', { date: today })
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
      {!data && !failed && <Loading />}
      {!data && failed && <LoadFailed onRetry={load} />}
      {data &&
        WHY_ORDER.map((r) => {
          const Icon = ICONS[r]
          const points = data.series[r]
          // The latest night with a normal on record, so a night not yet in
          // (or one the Watch missed) never reads as "still learning".
          const last = [...points].reverse().find((p) => p.known)
          return (
            <section key={r} className={`card reading reading-${cssName(r)}`} aria-labelledby={`trend-${r}`}>
              <h2 id={`trend-${r}`} className="reading-name">
                <Icon />
                {wording.why.titles[r]}
              </h2>
              {last?.building && <p className="caption">{t.building(last.validNights, data.minValid[r] ?? 21)}</p>}
              <TrendChart reading={r} points={points} label={t.chartLabel(wording.why.names[r])} />
              <p className="caption">{t.legend}</p>
            </section>
          )
        })}
    </main>
  )
}
