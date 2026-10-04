// When the app asks whether today's nudge was followed (R52 to R55, D32,
// D67, D68). Pure, so the timing is tested without a clock or a database.

import type { Nudge } from '../../supabase/functions/_shared/briefing.ts'
import { minutesOfDay } from './when'

export type FollowAnswer = 'yes' | 'no'

// A day whose shown nudge asked for a change, and its latest answer.
export interface FollowDay {
  date: string
  nudge: Exclude<Nudge, 'train_as_planned'>
  answer: FollowAnswer | null
}

export const ASK_FROM = 20 * 60
export const ANSWER_UNTIL = 12 * 60

// From 8pm on a change day, the question sits at the top of the card (R52, R53).
export function askTonight(now: Date, today: FollowDay | null): boolean {
  return today !== null && minutesOfDay(now) >= ASK_FROM
}

// The next morning, until noon, an unanswered day is asked about first (R55, D67, D68).
export function askYesterday(now: Date, yesterday: FollowDay | null): boolean {
  return yesterday !== null && yesterday.answer === null && minutesOfDay(now) < ANSWER_UNTIL
}

// The change days among what was shown: the first shown nudge of each day
// (D61), when it asked for a change, with that day's latest answer.
export function followDays(
  shown: { date: string; nudge: Nudge; shown_at: string }[],
  answers: { date: string; answer: FollowAnswer; answered_at: string }[],
): Map<string, FollowDay> {
  const first = new Map<string, Nudge>()
  for (const s of [...shown].sort((a, b) => a.shown_at.localeCompare(b.shown_at))) if (!first.has(s.date)) first.set(s.date, s.nudge)
  const days = new Map<string, FollowDay>()
  for (const [date, nudge] of first) if (nudge !== 'train_as_planned') days.set(date, { date, nudge, answer: null })
  const latest = [...answers].sort((a, b) => b.answered_at.localeCompare(a.answered_at))
  for (const day of days.values()) day.answer = latest.find((a) => a.date === day.date)?.answer ?? null
  return days
}
