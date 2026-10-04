// Builds the words for a day from its daily_status row: the card's headline
// and briefing (R21), the morning notification's reason (R48) and Why today's
// summary (R36). Every word comes from wording.ts; this file only chooses and
// joins them. Plain TypeScript, so the web app and the push sender share it.

import { wording } from './wording.ts'

export type Reading = 'hrv' | 'sleep' | 'sleeping_hr'
export type Verdict = 'below' | 'above' | 'in_range' | 'missing' | 'building'
export type Status = 'ready' | 'ease_off' | 'rest' | 'none'
export type Nudge = 'train_as_planned' | 'train_easy' | 'rest' | 'prioritise_sleep'

// One score reading in daily_status.points.
export interface ReadingPoints {
  value: number | null
  normal: number | null
  range_low: number | null
  range_high: number | null
  verdict: Verdict
  spreads_worse: number | null
  counted: boolean
  points: number | null
}

// The parts of a daily_status row the words depend on.
export interface DayWords {
  status: Status
  points: Partial<Record<Reading, ReadingPoints>>
  readings_used: number
  reason_codes: string[]
  composite_fired: boolean | null
}

// How each reading reads in a sentence ("You slept..." comes first), and
// which way is worse: less sleep, lower HRV, a higher sleeping heart rate.
export const NARRATIVE_ORDER: Reading[] = ['sleep', 'hrv', 'sleeping_hr']
export const WHY_ORDER: Reading[] = ['hrv', 'sleep', 'sleeping_hr']
export const WORSE_WAY: Record<Reading, Verdict> = { hrv: 'below', sleep: 'below', sleeping_hr: 'above' }

// Worse than normal by at least this many spreads, while still inside the
// normal range (which reaches 2 spreads either side), reads as "a little".
export const SLIGHT_SPREADS = 1

type Kind = 'worse' | 'slight' | 'normal' | 'better' | 'missing' | 'building'

export function kindOf(reading: Reading, p: ReadingPoints | undefined): Kind {
  if (!p || p.verdict === 'missing') return 'missing'
  if (p.verdict === 'building') return 'building'
  if (p.verdict === WORSE_WAY[reading]) return 'worse'
  if (p.verdict === 'in_range') return (p.spreads_worse ?? 0) >= SLIGHT_SPREADS ? 'slight' : 'normal'
  return 'better'
}

const b = wording.briefing

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function sentence(clause: string): string {
  return `${capitalise(clause)}.`
}

// "A", "A, and B", "A, B, and C": joins whole clauses.
function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses.join('')
  return `${clauses.slice(0, -1).join(', ')}, ${b.and} ${clauses[clauses.length - 1]}`
}

// "a", "a and b", "a, b and c": joins names inside a clause.
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} ${b.and} ${names[names.length - 1]}`
}

function readingsOfKind(day: DayWords, kind: Kind, order: Reading[] = NARRATIVE_ORDER): Reading[] {
  return order.filter((r) => kindOf(r, day.points[r]) === kind)
}

// The reading that earned the most points among those given.
function lead(day: DayWords, readings: Reading[]): Reading {
  return [...readings].sort((x, y) => (day.points[y]?.points ?? 0) - (day.points[x]?.points ?? 0))[0]
}

export function headline(day: DayWords): string {
  const worse = readingsOfKind(day, 'worse')
  const slight = readingsOfKind(day, 'slight')
  const h = b.headline
  if (day.status === 'rest') return h.rest
  if (day.status === 'ready') {
    if (worse.length === 0 && slight.length === 0) return readingsOfKind(day, 'better').length > 0 ? h.ready.better : h.ready.allNormal
    if (worse.length === 0) return h.ready.small
    return h.ready[lead(day, worse)]
  }
  if (worse.includes('sleep') && worse.includes('hrv')) return h.ease_off.sleepAndHrv
  if (worse.length > 0) return h.ease_off[lead(day, worse)]
  return h.ease_off.small
}

function meaning(day: DayWords, worse: Reading[], slight: Reading[]): string {
  const m = b.meaning
  if (day.status === 'rest') return m.rest
  if (day.status === 'ready') {
    if (worse.length === 0) return slight.length === 0 ? m.readyAllNormal : m.readySmall
    return m.readyDespite
  }
  if (worse.length > 0 && worse.length + slight.length >= 2) return m.together
  if (worse.length === 1) return m[worse[0]]
  return m.small
}

function normalClause(readings: Reading[]): string | null {
  const names = readings.map((r) => b.names[r])
  if (names.length === 1) return b.normalOne(names[0])
  if (names.length === 2) return b.normalTwo(names[0], names[1])
  if (names.length === 3) return b.normalThree(names[0], names[1], names[2])
  return null
}

// The briefing for a day with a status: what was off, what it means, and
// what was normal (with the illness check when it ran). At most three
// sentences, no numbers (R21, R33).
export function briefing(day: DayWords): string[] {
  const worse = readingsOfKind(day, 'worse')
  const slight = readingsOfKind(day, 'slight')
  const offClauses = NARRATIVE_ORDER.flatMap((r) => {
    const kind = kindOf(r, day.points[r])
    if (kind === 'worse') return [b.worse[r]]
    if (kind === 'slight') return [b.slightlyWorse[r]]
    return []
  })
  const normal = normalClause(readingsOfKind(day, 'normal'))
  const better = readingsOfKind(day, 'better').map((r) => b.better[r])
  const rest = [
    ...readingsOfKind(day, 'missing').map((r) => b.missing[r]),
    ...readingsOfKind(day, 'building').map((r) => b.building[r]),
    ...(day.composite_fired === true ? [b.illnessFired] : day.composite_fired === false ? [b.illnessClear] : []),
  ]

  const sentences: string[] = []
  if (offClauses.length > 0) {
    sentences.push(sentence(joinClauses(offClauses)))
    sentences.push(meaning(day, worse, slight))
    const last = [...(normal ? [normal] : []), ...better, ...rest]
    if (last.length > 0) sentences.push(sentence(joinClauses(last)))
  } else {
    // Nothing worse than normal: the good news first, then what was normal.
    const first = [...better, ...(normal ? [normal] : [])]
    if (first.length > 0) sentences.push(sentence(joinClauses(first)))
    sentences.push(meaning(day, worse, slight))
    if (rest.length > 0) sentences.push(sentence(joinClauses(rest)))
  }
  return sentences
}

// The morning notification's text: "Ease off today: HRV well below your
// usual, sleep short" (R48). Null on a day without a status, which sends none.
export function morningNotification(day: DayWords): string | null {
  if (day.status === 'none') return null
  const label = wording.card.status[day.status]
  const reasons = (codes: string[]) =>
    codes
      .map((code) => wording.push.reasons[code as keyof typeof wording.push.reasons])
      .filter(Boolean)
      .slice(0, 2)
      .join(wording.push.reasonJoin)
  if (day.status === 'ready') {
    const outside = day.reason_codes.filter((code) => code.endsWith('_outside_range'))
    return wording.push.morning(label, outside.length > 0 ? wording.push.readyDespite(reasons(outside)) : wording.push.readyReason)
  }
  return wording.push.morning(label, reasons(day.reason_codes))
}

// "7h 10m": minutes asleep, as the design writes them.
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes)
  return wording.why.duration(Math.floor(total / 60), total % 60)
}

// Last night's values in plain words for "Learning your normal", with no
// verdicts (R32): "Last night you slept 6h 10m, your heart rate variability
// was 42 ms, and your heart rate while you slept was 55 bpm."
export function learningLastNight(night: { asleep_min: number | null; hrv: number | null; sleeping_hr: number | null }): string | null {
  const l = wording.states.learning
  const parts = [
    ...(night.asleep_min !== null ? [l.slept(formatDuration(night.asleep_min))] : []),
    ...(night.hrv !== null ? [l.hrv(String(Math.round(night.hrv)))] : []),
    ...(night.sleeping_hr !== null ? [l.sleepingHr(String(Math.round(night.sleeping_hr)))] : []),
  ]
  return parts.length > 0 ? l.lastNight(joinClauses(parts)) : null
}

export type IllnessCheck = 'fired' | 'clear' | 'not_run'
export interface AlsoReading {
  value: number | null
  verdict: Verdict | null
}

// "Also checked" on Why today (R39): breathing rate while asleep, yesterday's
// resting heart rate and the illness check. The design's words when both are
// normal and the check found nothing.
export function alsoChecked(breathing: AlsoReading, resting: AlsoReading, illness: IllnessCheck): string[] {
  const a = wording.why.alsoChecked
  const shown = (r: AlsoReading) => r.value !== null && r.verdict !== null && r.verdict !== 'missing'
  const breath = shown(breathing) ? capitalise(a.breathing(breathing.value!.toFixed(1))) : null
  const rest = shown(resting) ? a.resting(String(Math.round(resting.value!))) : null
  const illnessSentence = illness === 'fired' ? a.fired : illness === 'clear' ? a.clear : a.notRun

  if (breath && rest && breathing.verdict === 'in_range' && resting.verdict === 'in_range') {
    return illness === 'clear' ? [a.bothNormalClear(breath, rest)] : [a.bothNormal(breath, rest), illnessSentence]
  }

  const one = (r: AlsoReading, words: string | null, missing: string, building: string) => {
    if (r.verdict === 'building') return building
    if (!words) return missing
    if (r.verdict === 'above') return a.higher(capitalise(words))
    if (r.verdict === 'below') return a.lower(capitalise(words))
    return a.normal(capitalise(words))
  }
  return [
    one(breathing, breath, a.missingBreathing, a.buildingBreathing),
    one(resting, rest, a.missingResting, a.buildingResting),
    illnessSentence,
  ]
}

// Why today's summary (R36): how many readings were outside the normal range,
// then one sentence per group of readings.
export function whySummary(day: DayWords): { headline: string; body: string[] } {
  const w = wording.why
  const counted = WHY_ORDER.filter((r) => {
    const v = day.points[r]?.verdict
    return v !== undefined && v !== 'missing' && v !== 'building'
  })
  const below = counted.filter((r) => day.points[r]?.verdict === 'below')
  const above = counted.filter((r) => day.points[r]?.verdict === 'above')
  const inRange = counted.filter((r) => day.points[r]?.verdict === 'in_range')
  const outside = [...below, ...above]
  const total = Math.max(2, Math.min(3, counted.length)) as 2 | 3

  let headline: string
  if (outside.length === 0) {
    headline = w.summaryAllIn[total]
  } else {
    const dir = above.length === 0 ? w.low : below.length === 0 ? w.high : w.outside
    headline = w.summaryOff(w.counts[outside.length], w.countsLower[total], outside.length === 1 ? w.was : w.were, dir)
  }

  const names = (rs: Reading[]) => joinNames(rs.map((r) => w.names[r]))
  const body: string[] = []
  if (below.length > 0) body.push(w.groupBelow(names(below), w.verbFor(below.length)))
  if (above.length > 0) body.push(w.groupAbove(names(above), w.verbFor(above.length)))
  if (inRange.length > 0) body.push(w.groupNormal(names(inRange), w.verbFor(inRange.length)))
  for (const r of WHY_ORDER) {
    const v = day.points[r]?.verdict
    if (v === undefined || v === 'missing') body.push(w.groupMissing(w.names[r]))
    else if (v === 'building') body.push(w.groupBuilding(w.names[r]))
  }
  return { headline, body }
}
