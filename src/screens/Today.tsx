import { useCallback, useEffect, useRef, useState } from 'react'
import { briefing, headline, learningLastNight } from '../../supabase/functions/_shared/briefing'
import { wording } from '../../supabase/functions/_shared/wording'
import AppHeader from '../components/AppHeader'
import FollowThroughCard from '../components/FollowThroughCard'
import { BellIcon, CalendarIcon, ChevronRightIcon, FaceIcon, WarningIcon } from '../components/Icons'
import { type CardModel, type CardState, selectCard } from '../lib/card-state'
import { askTonight, askYesterday, type FollowAnswer, type FollowDay } from '../lib/follow'
import type { PushSupport } from '../lib/push'
import { go } from '../lib/route'
import {
  type CheckinAnswer,
  loadToday,
  logUsage,
  recordShown,
  submitCheckin,
  submitFollowThrough,
  type TodayData,
} from '../lib/today'
import { formatWhen, localDate, nextDigestDay, shortDate, syncWhen } from '../lib/when'
import CheckIn from './CheckIn'

const c = wording.card
const s = wording.states

// While a sync could arrive at any moment, the card checks again each minute.
const WATCHING: CardState['kind'][] = ['waiting', 'analysing', 'night_unfinished', 'missed']

// This phone's notifications: whether they can work here and are on (R34).
export interface PushState {
  support: PushSupport
  subscribed: boolean
}

// The readiness card: the app's home (R20 to R34), with the 8pm question on
// change days and yesterday's unanswered question the next morning (R52 to R56).
export default function Today({ push, fromFollowUp }: { push: PushState | null; fromFollowUp: boolean }) {
  const [data, setData] = useState<TodayData | null>(null)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => new Date())
  // The check-in screen: shown first each day, or opened from the card.
  const [checkin, setCheckin] = useState<'first' | 'later' | null>(null)
  // Yesterday's unanswered question, asked before today's check-in (D68).
  const [askingYesterday, setAskingYesterday] = useState(false)
  const yesterdayDone = useRef<string | null>(null)
  const logged = useRef(new Set<string>())
  // The check-in answered or skipped on this phone today, so a reload that
  // started before the server had it never asks again or shows it unanswered.
  const settled = useRef<{ date: string; answer: CheckinAnswer | null } | null>(null)
  // Only the newest load may update the card, however the replies arrive.
  const loads = useRef(0)

  const load = useCallback(async () => {
    const at = new Date()
    const mine = ++loads.current
    try {
      let d = await loadToday(at)
      if (mine !== loads.current) return
      const local = settled.current?.date === d.inputs.today ? settled.current : null
      if (local) d = { ...d, checkin: d.checkin ?? local.answer, skipped: d.skipped || local.answer === null }
      setNow(at)
      setData(d)
      setFailed(false)
      // The next morning asks about yesterday first (R55, D68), then how
      // you feel, both before today's status (R16).
      const y = d.follow.yesterday
      if (askYesterday(at, y) && y && yesterdayDone.current !== y.date) setAskingYesterday(true)
      if (!d.checkin && !d.skipped) setCheckin((open) => open ?? 'first')
    } catch {
      if (mine === loads.current) setFailed(true)
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

  // Each minute: check again while a sync is awaited, and start afresh when
  // the day changes, so yesterday's status never shows as today's (R25).
  const shownDay = data?.inputs.today
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const t = new Date()
      if ((kind && WATCHING.includes(kind)) || (shownDay && localDate(t) !== shownDay)) load()
      else setNow(t)
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [kind, shownDay, load])

  // Each card view is logged once per kind of card, never with health values
  // (R43); a card showing a status also records what it showed (D61).
  const onCard = !checkin && !askingYesterday
  useEffect(() => {
    if (!data || !kind || !onCard) return
    const key = `${data.inputs.today}:${kind}`
    if (logged.current.has(key)) return
    logged.current.add(key)
    logUsage('card_view', { date: data.inputs.today, status_shown: kind === 'status', state: kind })
    if (kind === 'status') recordShown(data.inputs.today).catch(() => undefined)
  }, [data, kind, onCard])

  // Today's change day is decided by what was first shown (D61). Only when
  // nothing has been shown yet does the status on this card decide, as the
  // card records it as shown now.
  const row = model?.state.kind === 'status' ? model.state.row : null
  const cardNudge = row?.nudge && row.nudge !== 'train_as_planned' ? row.nudge : null
  const followToday: FollowDay | null =
    data?.follow.today ?? (row && cardNudge && !data?.follow.shownToday ? { date: row.date, nudge: cardNudge, answer: null } : null)
  const evening = askTonight(now, followToday)

  async function answerFollow(day: 'today' | 'yesterday', date: string, a: FollowAnswer) {
    // The server checks what was shown, so make sure the card's record is in.
    if (day === 'today' && !data?.follow.today) await recordShown(date)
    // From the 8pm notification, the card after 8pm, or the next morning (R56).
    await submitFollowThrough(date, a, day === 'yesterday' ? 'next_morning' : fromFollowUp ? 'push' : 'card')
    setData((d) => {
      if (!d) return d
      const base = d.follow[day] ?? (day === 'today' ? followToday : null)
      return base ? { ...d, follow: { ...d.follow, [day]: { ...base, answer: a } } } : d
    })
  }

  function doneYesterday() {
    yesterdayDone.current = data?.follow.yesterday?.date ?? null
    setAskingYesterday(false)
  }

  async function answer(a: CheckinAnswer) {
    if (!data) return
    const date = data.inputs.today
    await submitCheckin(date, a, checkin === 'later' && kind === 'status')
    settled.current = { date, answer: a }
    setData((d) => (d && d.inputs.today === date ? { ...d, checkin: a } : d))
    setCheckin(null)
  }

  function skip() {
    if (!data) return
    const date = data.inputs.today
    logUsage('checkin_skipped', { date })
    settled.current = { date, answer: null }
    setData((d) => (d && d.inputs.today === date ? { ...d, skipped: true } : d))
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
      {data && model && askingYesterday && data.follow.yesterday && (
        <>
          <FollowThroughCard
            label={wording.followThrough.yesterdayLabel}
            action={c.nudges[data.follow.yesterday.nudge].action}
            answer={null}
            hint={wording.followThrough.yesterdayHint}
            onAnswer={async (a) => {
              await answerFollow('yesterday', data.follow.yesterday!.date, a)
              doneYesterday()
            }}
          />
          <button className="text-button" type="button" onClick={doneYesterday}>
            {wording.followThrough.notNow}
          </button>
        </>
      )}
      {data && model && !askingYesterday && checkin && <CheckIn mode={checkin} onAnswer={answer} onSkip={skip} onCancel={() => setCheckin(null)} />}
      {data && model && onCard && (
        <>
          {model.rejected && <RejectedNotice kind={model.rejected} />}
          {evening && followToday && (
            <FollowThroughCard
              label={wording.followThrough.label}
              action={c.nudges[followToday.nudge].action}
              answer={followToday.answer}
              hint={wording.followThrough.hint}
              onAnswer={(a) => answerFollow('today', followToday.date, a)}
            />
          )}
          <Card state={model.state} now={now} folded={evening} />
          <NotificationHealth push={push} lastFailed={data.lastNotification?.status === 'failed'} />
          {model.importMonths !== null && <p className="caption aside">{wording.sync.importProgress(model.importMonths)}</p>}
          <section className="list-card">
            <CheckinRow answer={data.checkin} onOpen={() => setCheckin('later')} />
            <DigestRow latest={data.latestDigest} now={now} />
          </section>
        </>
      )}
    </main>
  )
}

function Card({ state, now, folded }: { state: CardState; now: Date; folded: boolean }) {
  switch (state.kind) {
    case 'status':
      return <StatusCard state={state} now={now} folded={folded} />
    case 'waiting':
      return (
        <NoStatus
          pill={s.waiting.pill}
          headline={s.waiting.headline}
          lines={[state.lastSync ? s.waiting.lastSync(formatWhen(state.lastSync.toISOString(), now)) : s.waiting.neverSynced]}
        />
      )
    case 'analysing':
      return state.delayed ? (
        <NoStatus pill={s.analysing.pill} headline={s.analysing.delayedHeadline} lines={[s.analysing.delayedDetail]} />
      ) : (
        <NoStatus pill={s.analysing.pill} headline={s.analysing.headline} lines={[s.analysing.detail]} />
      )
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

// From 8pm on a change day the briefing folds to its headline and the nudge
// block is left out, as the question above repeats it (R53).
function StatusCard({ state, now, folded }: { state: Extract<CardState, { kind: 'status' }>; now: Date; folded: boolean }) {
  const [unfolded, setUnfolded] = useState(false)
  const { row } = state
  if (row.status === 'none') return null
  const nudge = row.nudge && !folded ? c.nudges[row.nudge] : null
  const showBriefing = !folded || unfolded
  return (
    <section className="card briefing" aria-labelledby="card-headline">
      <div className="status-row">
        <span className={`pill pill-${row.status}`}>{c.status[row.status]}</span>
        {state.late && <span className="pill pill-neutral">{c.late}</span>}
        {state.syncedAt && <span className="sync-time">{c.synced(syncWhen(state.syncedAt, now))}</span>}
      </div>
      {row.readings_used === 2 && <p className="caption">{c.partial}</p>}
      <h2 id="card-headline" className="card-headline">
        {headline(row)}
      </h2>
      {showBriefing && <p className="body">{briefing(row).join(' ')}</p>}
      {folded && (
        <button className="text-link" type="button" aria-expanded={unfolded} onClick={() => setUnfolded(!unfolded)}>
          {unfolded ? wording.followThrough.hideBriefing : wording.followThrough.showBriefing}
        </button>
      )}
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

// "Open Settings" at the foot of a notice.
function SettingsLink({ label }: { label: string }) {
  return (
    <a
      className="link-row"
      href="#/settings"
      onClick={(e) => {
        e.preventDefault()
        go('settings')
      }}
    >
      <span>{label}</span>
      <ChevronRightIcon className="chevron" />
    </a>
  )
}

// When notifications are off on this phone or the last one failed, say so
// and how to turn them back on (R34). Nothing while they can't work here
// (outside the Home Screen app); Settings explains that.
function NotificationHealth({ push, lastFailed }: { push: PushState | null; lastFailed: boolean }) {
  const h = wording.notificationHealth
  if (!push) return null
  const off = push.support === 'ready' && !push.subscribed
  const blocked = push.support === 'blocked'
  if (!off && !blocked && !lastFailed) return null
  const head = blocked ? h.blockedHeadline : off ? h.offHeadline : h.failingHeadline
  const body = blocked ? wording.notifications.blocked : off ? h.off : h.failing
  return (
    <section className="card notice" role="status" aria-labelledby="notify-headline">
      <div className="notice-title">
        <BellIcon className="notice-icon" />
        <h2 id="notify-headline" className="emphasis">
          {head}
        </h2>
      </div>
      <p className="body">{body}</p>
      {!blocked && <SettingsLink label={h.settings} />}
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
      {kind === 'token' && <SettingsLink label={s.rejected.settings} />}
    </section>
  )
}

// "Weekly digest" with the latest week, or when the first one comes (R20, R57, R58).
function DigestRow({ latest, now }: { latest: TodayData['latestDigest']; now: Date }) {
  const d = wording.digest
  const detail = latest
    ? d.rangeShort(shortDate(latest.week_start), shortDate(latest.week_end))
    : d.firstShort(shortDate(localDate(nextDigestDay(now))))
  return (
    <a
      className="list-row digest-row"
      href="#/digest"
      onClick={(e) => {
        e.preventDefault()
        go('digest')
      }}
    >
      <CalendarIcon className="row-icon" />
      <span className="row-text">{d.row}</span>
      <span className="row-detail">{detail}</span>
      <ChevronRightIcon className="chevron" />
    </a>
  )
}

// "You said you feel okay today" with Change, or a prompt after Skip (R17, R18).
function CheckinRow({ answer, onOpen }: { answer: CheckinAnswer | null; onOpen: () => void }) {
  const w = wording.checkin
  return (
    <div className="list-row checkin-row">
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
