// Made-up days for tests and the wording sample sheet. None of these are
// anyone's real readings. The first is the design's sample day (Clarivi
// Screens, Tuesday 29 September): HRV 38 ms against 52, sleep 5h 52m against
// 7h 10m, sleeping heart rate 51 against 50; 1.6 points, Ease off, train easy.

import type { DayWords, Reading, ReadingPoints, Verdict } from '../../supabase/functions/_shared/briefing.ts'

export interface SampleDay extends DayWords {
  nudge: 'train_as_planned' | 'train_easy' | 'rest' | 'prioritise_sleep' | null
  total: number | null
}

// A reading from its value, normal and spread, with the range 2 spreads
// either side, as the database works it out (D11, D51). Weights 40/35/25.
const WEIGHTS: Record<Reading, number> = { hrv: 0.4, sleeping_hr: 0.35, sleep: 0.25 }
const LOWER_IS_WORSE: Record<Reading, boolean> = { hrv: true, sleep: true, sleeping_hr: false }

export function reading(r: Reading, value: number, normal: number, spread: number): ReadingPoints {
  const low = normal - 2 * spread
  const high = normal + 2 * spread
  const verdict: Verdict = value < low ? 'below' : value > high ? 'above' : 'in_range'
  const spreads = Math.max(0, (LOWER_IS_WORSE[r] ? normal - value : value - normal) / spread)
  return { value, normal, range_low: low, range_high: high, verdict, spreads_worse: spreads, counted: true, points: WEIGHTS[r] * spreads }
}

export function notCounted(verdict: 'missing' | 'building', value: number | null = null): ReadingPoints {
  return { value, normal: null, range_low: null, range_high: null, verdict, spreads_worse: null, counted: false, points: null }
}

export const sampleDay: SampleDay = {
  status: 'ease_off',
  nudge: 'train_easy',
  total: 1.64,
  readings_used: 3,
  reason_codes: ['hrv_outside_range', 'sleep_outside_range', 'sleeping_hr_worse_than_normal'],
  composite_fired: false,
  points: {
    hrv: reading('hrv', 38, 52, 6),
    sleep: reading('sleep', 352, 430, 34),
    sleeping_hr: reading('sleeping_hr', 51, 50, 2.5),
  },
}
