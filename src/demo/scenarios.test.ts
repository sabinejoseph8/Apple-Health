import { describe, expect, it } from 'vitest'
import { checkOutput } from '../../supabase/functions/_shared/ai-filter.ts'
import { buildMorningInput, digestInputFrom } from '../../supabase/functions/_shared/ai-input.ts'
import { reading, sampleDay, sleepFloorDay, type SampleDay } from '../lib/sample-days'
import { TODAY } from './data'
import { DEFAULT_SCENARIO, EXAMPLE_DIGEST, EXAMPLE_MORNING, SCENARIOS, scenarioNow } from './scenarios'

const zones = { ease_off_at: 1.2, rest_at: 2.4 }
const ready: SampleDay = {
  ...sampleDay,
  status: 'ready',
  nudge: 'train_as_planned',
  total: 0,
  reason_codes: [],
  points: { hrv: reading('hrv', 54, 52, 6), sleep: reading('sleep', 440, 430, 34), sleeping_hr: reading('sleeping_hr', 50, 50, 2.5) },
}
const morning = (day: SampleDay) => buildMorningInput({ ...day, is_late: false }, { no_stages: false }, zones)!

// The demo's AI texts are fixed examples, so they must be texts the real filter would let through (R73).
describe('the demo\'s example AI texts pass the real filter', () => {
  it('the Ready morning', () => expect(checkOutput(morning(ready), { explanation: EXAMPLE_MORNING.ready })).toEqual([]))
  it('the Ease off morning', () => expect(checkOutput(morning(sampleDay), { explanation: EXAMPLE_MORNING.ease_off })).toEqual([]))
  it('the sleep floor morning', () => expect(checkOutput(morning(sleepFloorDay), { explanation: EXAMPLE_MORNING.sleep_floor })).toEqual([]))
  it('the weekly digest', () => {
    const day = (weekday: string, status: string, nudge: string, followed: string) => ({
      weekday, status, nudge, followed, checkin: 'okay', hrv: 50, sleeping_hr: 51, sleep: 430,
    })
    const input = digestInputFrom({
      days: [
        day('Monday', 'ready', 'train_as_planned', 'not_asked'),
        day('Tuesday', 'ease_off', 'train_easy', 'yes'),
        day('Wednesday', 'ease_off', 'train_easy', 'no'),
        day('Thursday', 'rest', 'rest', 'unanswered'),
        day('Friday', 'ready', 'train_as_planned', 'not_asked'),
        day('Saturday', 'none', 'none', 'not_asked'),
        day('Sunday', 'none', 'none', 'not_asked'),
      ],
      prior_weeks: [],
    })!
    expect(checkOutput(input, EXAMPLE_DIGEST)).toEqual([])
  })
})

describe('the demo\'s mornings', () => {
  it('start with a known default and have unique ids', () => {
    expect(SCENARIOS.map((s) => s.id)).toContain(DEFAULT_SCENARIO)
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length)
  })

  it('give every morning its own wall-clock time on the sample date, in the visitor\'s own time zone', () => {
    for (const s of SCENARIOS) {
      const now = scenarioNow(s)
      const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      expect(local).toBe(TODAY)
      expect([now.getHours(), now.getMinutes()]).toEqual(s.time)
    }
  })

  it('build their tables from the clock alone, so two builds of the same morning are the same', () => {
    for (const s of SCENARIOS) {
      const now = scenarioNow(s)
      expect(JSON.stringify(s.tables(now))).toBe(JSON.stringify(s.tables(now)))
    }
  })
})
