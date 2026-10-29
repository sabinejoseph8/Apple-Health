// What the AI is allowed to see (D94, R72, docs/ai-draft.md section 1). Every
// field is picked by name from what the database holds; nothing else can reach
// the input, whatever the rows contain. All values are numbers or fixed words:
// no free text, no name, no email, no user id, no calendar date, no time zone.

export type Reading = 'hrv' | 'sleeping_hr' | 'sleep'
export type Nudge = 'train_as_planned' | 'train_easy' | 'rest' | 'prioritise_sleep'

export interface ReadingInput {
  name: Reading
  verdict: 'below' | 'above' | 'in_range'
  value: number
  unit: 'ms' | 'bpm' | 'minutes'
  usual: number
  range_low: number
  range_high: number
  spreads_worse: number
  points: number
}

export interface MorningInput {
  kind: 'morning'
  status: 'ready' | 'ease_off' | 'rest'
  nudge: Nudge
  readings_used: number
  readings: ReadingInput[]
  total: number
  ease_off_at: number
  rest_at: number
  flags: { late_sync: boolean; no_sleep_stages: boolean; illness_pattern: boolean; sleep_floor: boolean }
}

export interface DayInput {
  weekday: string
  status: string
  nudge: string
  // yes or no: the person answered. unanswered: a question was asked (a change day) and not answered.
  // not_asked: no question that day (a Ready day, or a day with no status).
  followed: 'yes' | 'no' | 'unanswered' | 'not_asked'
  checkin: 'great' | 'okay' | 'off' | 'skipped'
  hrv: number | null
  sleeping_hr: number | null
  sleep: number | null
}

export interface PriorWeek {
  label: string
  ready: number
  ease_off: number
  rest: number
  avg_hrv: number | null
  avg_sleeping_hr: number | null
  avg_sleep: number | null
  checkins: { great: number; okay: number; off: number }
}

export interface DigestInput {
  kind: 'digest'
  days: DayInput[]
  prior_weeks: PriorWeek[]
}

export type AiInput = MorningInput | DigestInput

const UNITS: Record<Reading, ReadingInput['unit']> = { hrv: 'ms', sleeping_hr: 'bpm', sleep: 'minutes' }
const READINGS: Reading[] = ['hrv', 'sleeping_hr', 'sleep']

// The parts of a daily_status row the morning input is made from.
export interface StatusRowLike {
  status: string
  nudge: string | null
  readings_used: number
  points: Record<string, unknown>
  total: number | null
  is_late?: boolean | null
  composite_fired?: boolean | null
  sleep_floor?: boolean | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round2 = (n: number) => Math.round(n * 100) / 100

// Null when the day has no status to explain.
export function buildMorningInput(
  row: StatusRowLike,
  night: { no_stages?: boolean | null } | null,
  zones: { ease_off_at: number; rest_at: number },
): MorningInput | null {
  if (row.status !== 'ready' && row.status !== 'ease_off' && row.status !== 'rest') return null
  const nudge = row.nudge
  if (nudge !== 'train_as_planned' && nudge !== 'train_easy' && nudge !== 'rest' && nudge !== 'prioritise_sleep') return null
  const readings: ReadingInput[] = []
  for (const name of READINGS) {
    const p = row.points?.[name] as Record<string, unknown> | undefined
    if (!p || p.counted !== true) continue
    const verdict = p.verdict
    if (verdict !== 'below' && verdict !== 'above' && verdict !== 'in_range') continue
    const value = num(p.value)
    const usual = num(p.normal)
    const low = num(p.range_low)
    const high = num(p.range_high)
    const spreads = num(p.spreads_worse)
    const points = num(p.points)
    if (value === null || usual === null || low === null || high === null || spreads === null || points === null) continue
    readings.push({
      name,
      verdict,
      value: Math.round(value),
      unit: UNITS[name],
      usual: Math.round(usual),
      range_low: Math.round(low),
      range_high: Math.round(high),
      spreads_worse: round2(spreads),
      points: round2(points),
    })
  }
  return {
    kind: 'morning',
    status: row.status,
    nudge,
    readings_used: readings.length,
    readings,
    total: round2(num(row.total) ?? 0),
    ease_off_at: zones.ease_off_at,
    rest_at: zones.rest_at,
    flags: {
      late_sync: row.is_late === true,
      no_sleep_stages: night?.no_stages === true,
      illness_pattern: row.composite_fired === true,
      sleep_floor: row.sleep_floor === true,
    },
  }
}

const ASKED_ON = new Set(['train_easy', 'rest', 'prioritise_sleep'])
const WORDS_CHECKIN = new Set(['great', 'okay', 'off', 'skipped'])
const rounded = (v: unknown) => (num(v) === null ? null : Math.round(num(v)!))
const count = (v: unknown) => (num(v) === null ? 0 : Math.max(0, Math.round(num(v)!)))
// The labels ai_digest_input writes: "last week", then "2 weeks ago" to "8 weeks ago".
const LABEL = /^(last week|[2-8] weeks ago)$/
const word = (v: unknown, fallback: string) => (typeof v === 'string' && /^[a-z_ ]{1,20}$/i.test(v) ? v : fallback)

// The follow-through question is asked only on change days (R53), so a day
// with no answer is "unanswered" when a question was due and "not_asked"
// otherwise. Reading both as "not followed" misled a real digest (D95).
function followedOf(answer: unknown, nudge: unknown): DayInput['followed'] {
  if (answer === 'yes' || answer === 'no') return answer
  return ASKED_ON.has(String(nudge)) ? 'unanswered' : 'not_asked'
}

// The digest input from ai_digest_input's answer, copying only the allowed
// fields and refusing any other shape.
export function digestInputFrom(raw: unknown): DigestInput | null {
  const r = raw as { days?: unknown; prior_weeks?: unknown } | null
  if (!r || !Array.isArray(r.days) || r.days.length === 0) return null
  const days: DayInput[] = r.days.slice(0, 7).map((d: Record<string, unknown>) => ({
    weekday: word(d.weekday, ''),
    status: word(d.status, 'none'),
    nudge: word(d.nudge, 'none'),
    followed: followedOf(d.followed, d.nudge),
    checkin: (WORDS_CHECKIN.has(String(d.checkin)) ? d.checkin : 'skipped') as DayInput['checkin'],
    hrv: rounded(d.hrv),
    sleeping_hr: rounded(d.sleeping_hr),
    sleep: rounded(d.sleep),
  }))
  const prior = Array.isArray(r.prior_weeks) ? r.prior_weeks.slice(0, 8) : []
  const prior_weeks: PriorWeek[] = prior.map((w: Record<string, unknown>) => {
    const c = (w.checkins ?? {}) as Record<string, unknown>
    return {
      label: typeof w.label === 'string' && LABEL.test(w.label) ? w.label : '',
      ready: count(w.ready),
      ease_off: count(w.ease_off),
      rest: count(w.rest),
      avg_hrv: rounded(w.avg_hrv),
      avg_sleeping_hr: rounded(w.avg_sleeping_hr),
      avg_sleep: rounded(w.avg_sleep),
      checkins: { great: count(c.great), okay: count(c.okay), off: count(c.off) },
    }
  })
  return { kind: 'digest', days, prior_weeks }
}

// A fingerprint of the input (never the input itself), so the same input is
// not sent twice.
export async function inputHash(input: AiInput): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
