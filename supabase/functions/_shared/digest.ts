// Writes the weekly digest's sentences from the week's facts (R57, R58).
// The facts come from build_digest in the database; every word comes from
// wording.ts. Kept apart from the facts so another writer (another channel,
// or a model-written digest later) can replace it (tech-spec pattern 9).

import { joinNames, type Reading } from './briefing.ts'
import { wording } from './wording.ts'

export interface DigestFacts {
  week_start: string
  week_end: string
  days_with_data: number
  statuses: { ready: number; ease_off: number; rest: number; none: number }
  flagged: { date: string; status: 'ease_off' | 'rest' }[]
  readings: Record<Reading, { nights: number; below: number; above: number; average: number | null; normal: number | null }>
  pattern_nights: number
  nudges: { change_days: number; followed: number; not_followed: number; unanswered: number }
}

export interface DigestWords {
  nights: string
  status: string[]
  readings: string[]
  nudges: string
}

const d = wording.digest
const READINGS: Reading[] = ['hrv', 'sleep', 'sleeping_hr']

// "Tuesday" for "2026-09-22".
function weekday(date: string): string {
  return wording.day.weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()]
}

export function digestWords(f: DigestFacts): DigestWords {
  const nights = f.days_with_data >= 7 ? d.nightsAll : f.days_with_data === 0 ? d.nightsNone : d.nightsSome(f.days_with_data)

  const parts = (['ready', 'ease_off', 'rest'] as const)
    .filter((s) => f.statuses[s] > 0)
    .map((s) => d.statusPart(wording.card.status[s], f.statuses[s]))
  const status = parts.length > 0 ? [d.statusLine(joinNames(parts))] : [d.noStatus]
  if (f.flagged.length > 0) status.push(d.flagged(joinNames(f.flagged.map((x) => weekday(x.date)))))

  const readings = READINGS.map((r) => {
    const x = f.readings[r]
    const name = d.names[r]
    if (!x || x.nights === 0) return d.noReadings(name)
    if (x.below > 0 && x.above > 0) return d.both(name, x.below, x.above, x.nights)
    if (x.below > 0) return d.below(name, x.below, x.nights)
    if (x.above > 0) return d.above(name, x.above, x.nights)
    return d.inRange(name, x.nights)
  })
  if (f.pattern_nights > 0) readings.push(d.pattern(f.pattern_nights))

  const n = f.nudges
  const answered = [
    ...(n.followed > 0 ? [d.followed(n.followed)] : []),
    ...(n.not_followed > 0 ? [d.notFollowed(n.not_followed)] : []),
    ...(n.unanswered > 0 ? [d.unanswered(n.unanswered)] : []),
  ]
  const nudges = n.change_days === 0 ? d.noChange : d.nudgeLine(d.changeDays(n.change_days), joinNames(answered))

  return { nights, status, readings, nudges }
}
