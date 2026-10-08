import { type ReactNode, useEffect, useId, useState } from 'react'
import { alsoChecked, capitalise, type Reading, type ReadingPoints, WHY_ORDER, whySummary } from '../../supabase/functions/_shared/briefing'
import { wording } from '../../supabase/functions/_shared/wording'
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, HeartIcon, MoonIcon, PulseIcon, TickCircleIcon } from '../components/Icons'
import MiniChart, { cssName } from '../components/MiniChart'
import { Loading, LoadFailed } from '../components/LoadState'
import NavBar from '../components/NavBar'
import { go, goDay } from '../lib/route'
import { addDays, type DayData, loadDay } from '../lib/day'
import { type CardState, selectCard, type StatusRow } from '../lib/card-state'
import { loadStatusInputs, logUsage } from '../lib/today'
import { dateLine, localDate, syncWhen } from '../lib/when'
import { bigValue, fourWeeksText, loadWhy, rangeText, shortValue, totalText, vsNormalText, type WhyData, zoneNumber, type Zones } from '../lib/why'

const w = wording.why
const p = wording.pastDay
const ICONS: Record<Reading, typeof PulseIcon> = { hrv: PulseIcon, sleep: MoonIcon, sleeping_hr: HeartIcon }

type Loaded = { now: Date; today: string; state: CardState; why: WhyData | null }

// Why today: how today's status was set, reading by reading (R35 to R43).
export default function WhyToday() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)

  async function load() {
    const now = new Date()
    try {
      const inputs = await loadStatusInputs(now)
      const { state } = selectCard(inputs)
      const why = state.kind === 'status' ? await loadWhy(inputs.today, state.row.settings_version) : null
      setLoaded({ now, today: inputs.today, state, why })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Each opening is logged (R43), with the day and nothing else.
  useEffect(() => {
    if (loaded) logUsage('why_today_open', { date: loaded.today })
  }, [loaded?.today])

  const state = loaded?.state
  const status = state?.kind === 'status' && state.row.status !== 'none' ? state.row.status : null
  const title = status ? wording.card.why[status] : w.title

  return (
    <main className="page why">
      <NavBar title={title} />
      {!loaded && !failed && <Loading />}
      {!loaded && failed && <LoadFailed onRetry={load} />}
      {loaded && state?.kind === 'status' && status && loaded.why ? (
        <StatusWhy
          dateText={state.syncedAt ? w.dateLine(dateLine(loaded.now), syncWhen(state.syncedAt, loaded.now)) : null}
          row={state.row}
          why={loaded.why}
          past={false}
          after={
            <button className="secondary" type="button" onClick={() => goDay(addDays(loaded.today, -1))}>
              {p.previous}
            </button>
          }
        />
      ) : (
        loaded && (
          <section className="card">
            <p className="body">{w.noStatus}</p>
          </section>
        )
      )}
    </main>
  )
}

type ShowProps = { dateText: string | null; row: StatusRow; why: WhyData; past: boolean; after?: ReactNode }

function StatusWhy({ dateText, row, why, past, after }: ShowProps) {
  if (row.status === 'none') return null
  const summary = whySummary(row, past)
  const nudge = row.nudge ? wording.card.nudges[row.nudge].action : null
  return (
    <>
      {dateText && <p className="caption date-line">{dateText}</p>}

      <section className="card summary" aria-labelledby="why-summary">
        <div className="status-row">
          <span className={`pill pill-${row.status}`}>{wording.card.status[row.status]}</span>
          {nudge && <span className="sync-time">{nudge}</span>}
        </div>
        {row.readings_used === 2 && <p className="caption">{wording.card.partial}</p>}
        <h2 id="why-summary" className="summary-title">
          {summary.headline}
        </h2>
        <p className="body">{summary.body.join(' ')}</p>
      </section>

      <h2 className="section-title">{past ? p.thatNight : w.lastNight}</h2>
      {WHY_ORDER.map((r) => (
        <ReadingCard key={r} reading={r} point={row.points[r]} why={why} past={past} />
      ))}

      <section className="card also" aria-labelledby="also-checked">
        <h3 id="also-checked" className="card-title">
          {w.alsoChecked.title}
        </h3>
        <p className="body">{alsoChecked(why.breathing, why.resting, why.illness, past).join(' ')}</p>
      </section>

      <h2 className="section-title">{past ? p.decidedTitle : w.decided.title}</h2>
      <Decided row={row} zones={why.zones} recorded={why.normals.sleep?.validNights ?? null} past={past} />

      <button className="primary" type="button" onClick={() => go('trends')}>
        {wording.trends.see}
      </button>
      {after}
    </>
  )
}

function ReadingCard({ reading, point, why, past }: { reading: Reading; point: ReadingPoints | undefined; why: WhyData; past: boolean }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const Icon = ICONS[reading]
  const verdict = point?.verdict ?? 'missing'
  const normal = why.normals[reading]
  const value = point?.value ?? null
  const normalValue = point?.normal ?? normal?.median ?? null
  const low = verdict === 'building' ? null : (point?.range_low ?? normal?.low ?? null)
  const high = verdict === 'building' ? null : (point?.range_high ?? normal?.high ?? null)
  const nights = why.nights[reading]
  const needed = why.zones?.readings?.[reading]?.min_valid_nights ?? why.zones?.min_valid_nights ?? 21
  const canShowNumbers = value !== null && normalValue !== null && low !== null && high !== null

  return (
    <section className={`card reading reading-${cssName(reading)}`} aria-labelledby={`${panelId}-name`}>
      <div className="reading-head">
        <h3 id={`${panelId}-name`} className="reading-name">
          <Icon />
          {w.titles[reading]}
        </h3>
        <span className="caption">{past ? p.thatNight : w.lastNight}</span>
      </div>
      <p className="caption">{(past ? { ...w.explainers, ...p.explainers } : w.explainers)[reading]}</p>

      {value !== null && verdict !== 'missing' && (
        <div className="reading-values">
          <p className="big-value">
            {bigValue(reading, value).map((part) => (
              <span key={part.unit}>
                {part.number}
                <small>{part.unit}</small>
              </span>
            ))}
          </p>
          {normalValue !== null && verdict !== 'building' && (
            <p className="normal-value">
              <small>{w.normalForYou}</small>
              {shortValue(reading, normalValue)}
            </p>
          )}
        </div>
      )}

      <p className={`verdict verdict-${verdict}`}>
        {verdict === 'below' && <ArrowDownIcon />}
        {verdict === 'above' && <ArrowUpIcon />}
        {verdict === 'in_range' && <TickCircleIcon />}
        {verdict === 'building'
          ? w.building(normal?.validNights ?? 0, needed)
          : verdict === 'missing' && past
            ? p.missing
            : w.verdicts[verdict]}
      </p>

      <MiniChart
        reading={reading}
        nights={nights}
        normal={verdict === 'building' ? null : normalValue}
        low={low}
        high={high}
        outside={verdict === 'below' || verdict === 'above'}
        label={w.chart.label(w.names[reading])}
        end={past ? p.chartEnd : w.chart.end}
      />

      {canShowNumbers && (
        <>
          <button className="text-link" type="button" aria-expanded={open} aria-controls={`${panelId}-numbers`} onClick={() => setOpen(!open)}>
            {open ? w.hideNumbers : w.showNumbers}
          </button>
          {open && (
            <div id={`${panelId}-numbers`} className="numbers">
              <dl>
                <div>
                  <dt>{w.numbers.range}</dt>
                  <dd>{rangeText(reading, low!, high!)}</dd>
                </div>
                <div>
                  <dt>{w.numbers.vsNormal}</dt>
                  <dd>{vsNormalText(reading, value!, normalValue!)}</dd>
                </div>
                {fourWeeksText(nights, value!) && (
                  <div>
                    <dt>{w.numbers.fourWeeks}</dt>
                    <dd>{fourWeeksText(nights, value!)}</dd>
                  </div>
                )}
              </dl>
              <p className="caption">{w.numbers.footnote(why.zones?.readings?.[reading]?.window_nights ?? why.zones?.window_nights ?? 42)}</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// How today's status is decided (R40): points and zones on tap, never the weights.
function Decided({ row, zones, recorded, past }: { row: StatusRow; zones: Zones | null; recorded: number | null; past: boolean }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const d = w.decided
  if (row.status === 'none') return null
  const order = zones?.reading_order?.filter((r) => r in w.names) ?? WHY_ORDER
  const name = (r: Reading) => w.names[r]

  return (
    <section className="card decided">
      <p className="body">
        {d.intro} {order.length === 3 && d.order(capitalise(name(order[0])), name(order[1]), name(order[2]))} {past ? p.adds[row.status] : d.adds[row.status]}
      </p>
      {zones && (
        <>
          <button className="text-link" type="button" aria-expanded={open} aria-controls={`${panelId}-points`} onClick={() => setOpen(!open)}>
            {open ? w.hideNumbers : w.showNumbers}
          </button>
          {open && (
            <div id={`${panelId}-points`} className="numbers">
              <table className="points">
                <thead className="visually-hidden">
                  <tr>
                    <th scope="col">{d.reading}</th>
                    <th scope="col">{d.points}</th>
                  </tr>
                </thead>
                <tbody>
                  {WHY_ORDER.map((r) => {
                    const p = row.points[r]
                    return (
                      <tr key={r}>
                        <th scope="row">{capitalise(name(r))}</th>
                        <td>{p?.counted && p.points !== null ? p.points.toFixed(1) : d.notCounted}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{d.total}</th>
                    <td>{totalText(row.total ?? 0, zones)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="zones">
                {(['ready', 'ease_off', 'rest'] as const).map((z) => (
                  <div key={z} className={`zone${z === row.status ? ` zone-today zone-${z}` : ''}`}>
                    {z === row.status && !past && <span className="zone-tag">{d.today}</span>}
                    <span className="zone-name">{d.zones[z]}</span>
                    <span className="zone-range">
                      {z === 'ready'
                        ? d.under(zoneNumber(zones.ease_off_at))
                        : z === 'ease_off'
                          ? d.between(zoneNumber(zones.ease_off_at), zoneNumber(zones.rest_at))
                          : d.orMore(zoneNumber(zones.rest_at))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {recorded !== null && <p className="caption">{d.footnote(zones.window_nights, recorded)}</p>}
        </>
      )}
    </section>
  )
}

// A past day (D88): Why today for that date, with the day as the title and
// Previous day and Next day to step through. Opening one isn't logged, so the
// test's engagement numbers stay as they are.
export function DayView({ date }: { date: string }) {
  const [data, setData] = useState<DayData | null>(null)
  const [failed, setFailed] = useState(false)
  const today = localDate(new Date())

  async function load() {
    try {
      setData(await loadDay(date))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    load()
  }, [date])

  const row = data?.row ?? null
  const past = date < today
  const title = dateLine(new Date(`${date}T12:00:00`))
  const canBack = data ? data.earliest !== null && date > data.earliest : false
  const canNext = date < today

  return (
    <main className="page why day">
      <NavBar title={title} backLabel={p.back} />
      {!data && !failed && <Loading />}
      {!data && failed && <LoadFailed onRetry={load} />}
      {data && !row && (
        <section className="card">
          <p className="body">{p.nothing}</p>
        </section>
      )}
      {data && row && row.status !== 'none' && data.why && <StatusWhy dateText={null} row={row} why={data.why} past={past} />}
      {data && row && row.status === 'none' && data.why && <NoStatusDay row={row} why={data.why} past={past} />}
      {data && (canBack || canNext) && (
        <nav className="day-nav" aria-label={title}>
          {canBack ? (
            <button className="text-link" type="button" onClick={() => goDay(addDays(date, -1), true)}>
              <ChevronLeftIcon size={18} />
              {p.previous}
            </button>
          ) : (
            <span />
          )}
          {canNext && (
            <button className="text-link" type="button" onClick={() => goDay(addDays(date, 1), true)}>
              {p.next}
              <ChevronRightIcon size={18} />
            </button>
          )}
        </nav>
      )}
    </main>
  )
}

// A day without a status: why, then the readings that arrived that night.
function NoStatusDay({ row, why, past }: { row: StatusRow; why: WhyData; past: boolean }) {
  const anyValue = WHY_ORDER.some((r) => row.points[r]?.value !== null && row.points[r]?.value !== undefined)
  const [pill, headline, detail] = noStatusWords(row, anyValue, past)
  return (
    <>
      <section className="card summary">
        <div className="status-row">
          <span className="pill pill-neutral">{pill}</span>
        </div>
        <h2 className="summary-title">{headline}</h2>
        {detail && <p className="body">{detail}</p>}
      </section>
      {anyValue && (
        <>
          <h2 className="section-title">{past ? p.thatNight : w.lastNight}</h2>
          {WHY_ORDER.map((r) => (
            <ReadingCard key={r} reading={r} point={row.points[r]} why={why} past={past} />
          ))}
        </>
      )}
    </>
  )
}

// The pill, headline and line for a day without a status: as the card says
// them today, or said about that day on a past day. A past night that never
// finished arriving is simply not enough data, as the card says after noon.
function noStatusWords(row: StatusRow, anyValue: boolean, past: boolean): [string, string, string | null] {
  const s = wording.states
  const n = p.noStatus
  switch (row.no_status_reason) {
    case 'no_sleep_stages':
      return [s.noSleepStages.pill, s.noSleepStages.headline, past ? n.noSleepStages : s.noSleepStages.detail]
    case 'learning':
      return [s.learning.pill, past ? n.learning : s.learning.headline, null]
    case 'night_unfinished':
      if (past) return [s.notEnoughData.pill, n.notEnoughData, n.unfinished]
      return [s.nightUnfinished.pill, s.nightUnfinished.headline, null]
    default:
      if (past) return [s.notEnoughData.pill, n.notEnoughData, anyValue ? n.tooFew : n.noSleep]
      return [s.notEnoughData.pill, s.notEnoughData.headline, anyValue ? s.notEnoughData.tooFew : s.notEnoughData.noSleep]
  }
}
