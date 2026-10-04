import { useCallback, useEffect, useRef, useState } from 'react'
import { briefing, headline, learningLastNight } from '../../supabase/functions/_shared/briefing'
import { wording } from '../../supabase/functions/_shared/wording'
import AppHeader from '../components/AppHeader'
import { ChevronRightIcon, FaceIcon, WarningIcon } from '../components/Icons'
import { type CardModel, type CardState, selectCard } from '../lib/card-state'
import { go } from '../lib/route'
import { type CheckinAnswer, loadToday, logUsage, submitCheckin, type TodayData } from '../lib/today'
import { formatTime, formatWhen } from '../lib/when'
import CheckIn from './CheckIn'

const c = wording.card
const s = wording.states

// While a sync could arrive at any moment, the card checks again each minute.
const WATCHING: CardState['kind'][] = ['waiting', 'analysing', 'night_unfinished', 'missed']

// The readiness card: the app's home (R20 to R34).
export default function Today() {
  const [data, setData] = useState<TodayData | null>(null)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => new Date())
  // The check-in screen: shown first each day, or opened from the card.
  const [checkin, setCheckin] = useState<'first' | 'later' | null>(null)
  const logged = useRef(new Set<string>())
  // The day the check-in was answered or skipped on this phone, so a reload
  // before the server has the answer never asks twice.
  const settledFor = useRef<string | null>(null)

  const load = useCallback(async () => {
    const at = new Date()
    try {
      const d = await loadToday(at)
      setNow(at)
      setData(d)
      setFailed(false)
      // The first open of the day asks how you feel before the status (R16).
      if (!d.checkin && !d.skipped && settledFor.current !== d.inputs.today) setCheckin((open) => open ?? 'first')
    } catch {
      setFailed(true)
    }
  }, [])

  const model: CardModel | null = data ? selectCard({ ...data.inputs, now }) : null
  const kind = model?.state.kind

  useEffect(() => {
    load()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (kind && WATCHING.includes(kind)) load()
      else setNow(new Date())
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [kind, load])

  // Each card view is logged once per kind of card, never with health values (R43).
  useEffect(() => {
    if (!data || !kind || checkin) return
    const key = `${data.inputs.today}:${kind}`
    if (logged.current.has(key)) return
    logged.current.add(key)
    logUsage('card_view', { date: data.inputs.today, status_shown: kind === 'status', state: kind })
  }, [data, kind, checkin])

  async function answer(a: CheckinAnswer) {
    if (!data) return
    await submitCheckin(data.inputs.today, a, checkin === 'later' && kind === 'status')
    settledFor.current = data.inputs.today
    setData({ ...data, checkin: a })
    setCheckin(null)
  }

  function skip() {
    if (!data) return
    logUsage('checkin_skipped', { date: data.inputs.today })
    settledFor.current = data.inputs.today
    setData({ ...data, skipped: true })
    setCheckin(null)
  }

  return (
    <main className="page today">
      <AppHeader now={now} />
      {!data && !failed && <section className="card briefing loading" aria-busy="true" />}
      {!data && failed && (
        <section className="card briefing">
          <p className="body">{c.loadFailed}</p>
          <button className="text-button" type="button" onClick={load}>
            {c.retry}
          </button>
        </section>
      )}
      {data && model && checkin && <CheckIn mode={checkin} onAnswer={answer} onSkip={skip} onCancel={() => setCheckin(null)} />}
      {data && model && !checkin && (
        <>
          {model.rejected && <RejectedNotice kind={model.rejected} />}
          <Card state={model.state} now={now} />
          {model.importMonths !== null && <p className="caption aside">{wording.sync.importProgress(model.importMonths)}</p>}
          <section className="list-card">
            <CheckinRow answer={data.checkin} onOpen={() => setCheckin('later')} />
          </section>
        </>
      )}
    </main>
  )
}

function Card({ state, now }: { state: CardState; now: Date }) {
  switch (state.kind) {
    case 'status':
      return <StatusCard state={state} />
    case 'waiting':
      return (
        <NoStatus
          pill={s.waiting.pill}
          headline={s.waiting.headline}
          lines={[state.lastSync ? s.waiting.lastSync(formatWhen(state.lastSync.toISOString(), now)) : s.waiting.neverSynced]}
        />
      )
    case 'analysing':
      return <NoStatus pill={s.analysing.pill} headline={s.analysing.headline} lines={[s.analysing.detail]} />
    case 'night_unfinished':
      return <NoStatus pill={s.nightUnfinished.pill} headline={s.nightUnfinished.headline} lines={[s.nightUnfinished.detail]} />
    case 'missed':
      return <NoStatus pill={s.missed.pill} headline={s.missed.headline} lines={[s.missed.detail]} />
    case 'no_sync':
      return <NoStatus pill={s.noSync.pill} headline={state.afterNoon ? s.noSync.afterNoon : s.noSync.headline} lines={[s.noSync.detail]} />
    case 'not_enough_data':
      return (
        <NoStatus
          pill={s.notEnoughData.pill}
          headline={s.notEnoughData.headline}
          lines={[state.why === 'no_sleep' ? s.notEnoughData.noSleep : state.why === 'unfinished' ? s.notEnoughData.unfinished : s.notEnoughData.tooFew]}
        />
      )
    case 'learning': {
      const values = state.night
        ? learningLastNight({ asleep_min: state.night.asleep_min, hrv: state.night.hrv_median, sleeping_hr: state.night.sleeping_hr })
        : null
      return (
        <NoStatus
          pill={s.learning.pill}
          headline={s.learning.headline}
          lines={[s.learning.progress(state.nights, state.needed), ...(values ? [values] : [])]}
        />
      )
    }
  }
}

function StatusCard({ state }: { state: Extract<CardState, { kind: 'status' }> }) {
  const { row } = state
  if (row.status === 'none') return null
  const nudge = row.nudge ? c.nudges[row.nudge] : null
  return (
    <section className="card briefing" aria-labelledby="card-headline">
      <div className="status-row">
        <span className={`pill pill-${row.status}`}>{c.status[row.status]}</span>
        {state.late && <span className="pill pill-neutral">{c.late}</span>}
        {state.syncedAt && <span className="sync-time">{c.synced(formatTime(state.syncedAt))}</span>}
      </div>
      {row.readings_used === 2 && <p className="caption">{c.partial}</p>}
      <h2 id="card-headline" className="card-headline">
        {headline(row)}
      </h2>
      <p className="body">{briefing(row).join(' ')}</p>
      {state.late && <p className="caption">{c.lateNote}</p>}
      {nudge && (
        <div className={`nudge nudge-${row.status}`}>
          <p className="eyebrow">{c.nudgeLabel}</p>
          <p className="nudge-action">{nudge.action}</p>
          <p className="nudge-detail">{nudge.detail}</p>
        </div>
      )}
      <a
        className="link-row"
        href="#/why"
        onClick={(e) => {
          e.preventDefault()
          go('why')
        }}
      >
        <span>{c.why[row.status]}</span>
        <ChevronRightIcon className="chevron" />
      </a>
    </section>
  )
}

// A card without a status: a neutral pill, a headline and a plain line (R25 to R32).
function NoStatus({ pill, headline, lines }: { pill: string; headline: string; lines: string[] }) {
  return (
    <section className="card briefing" aria-labelledby="card-headline">
      <div className="status-row">
        <span className="pill pill-neutral">{pill}</span>
      </div>
      <h2 id="card-headline" className="card-headline">
        {headline}
      </h2>
      {lines.map((line) => (
        <p key={line} className="body">
          {line}
        </p>
      ))}
    </section>
  )
}

// "Sync is being rejected" with the way to fix it (R11).
function RejectedNotice({ kind }: { kind: 'token' | 'other' }) {
  return (
    <section className="card notice" role="status" aria-labelledby="rejected-headline">
      <div className="notice-title">
        <WarningIcon className="notice-icon" />
        <h2 id="rejected-headline" className="emphasis">
          {s.rejected.headline}
        </h2>
      </div>
      <p className="body">{kind === 'token' ? s.rejected.token : s.rejected.other}</p>
      {kind === 'token' && (
        <a
          className="link-row"
          href="#/settings"
          onClick={(e) => {
            e.preventDefault()
            go('settings')
          }}
        >
          <span>{s.rejected.settings}</span>
          <ChevronRightIcon className="chevron" />
        </a>
      )}
    </section>
  )
}

// "You said you feel okay today" with Change, or a prompt after Skip (R17, R18).
function CheckinRow({ answer, onOpen }: { answer: CheckinAnswer | null; onOpen: () => void }) {
  const w = wording.checkin
  return (
    <div className="list-row">
      <FaceIcon answer={answer} className="row-icon" />
      <span className="row-text">
        {answer ? (
          <>
            {w.saidBefore} <strong>{w.answerInline[answer]}</strong> {w.saidAfter}
          </>
        ) : (
          w.question
        )}
      </span>
      <button className="row-action" type="button" onClick={onOpen}>
        {answer ? w.change : w.answer}
      </button>
    </div>
  )
}
