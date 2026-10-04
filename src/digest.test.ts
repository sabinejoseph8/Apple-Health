import { describe, expect, it } from 'vitest'
import { type DigestFacts, digestWords } from '../supabase/functions/_shared/digest'
import { FORBIDDEN_TERMS } from './lib/forbidden-terms'

// The fixed made-up week of the database test (16_digests.test.sql).
const week: DigestFacts = {
  week_start: '2026-09-21',
  week_end: '2026-09-27',
  days_with_data: 6,
  statuses: { ready: 2, ease_off: 2, rest: 1, none: 2 },
  flagged: [
    { date: '2026-09-22', status: 'ease_off' },
    { date: '2026-09-23', status: 'ease_off' },
    { date: '2026-09-24', status: 'rest' },
  ],
  readings: {
    hrv: { nights: 5, below: 2, above: 0, average: 44.8, normal: 52 },
    sleep: { nights: 5, below: 0, above: 0, average: 430, normal: 430 },
    sleeping_hr: { nights: 5, below: 0, above: 1, average: 51.6, normal: 50 },
  },
  pattern_nights: 1,
  nudges: { change_days: 3, followed: 1, not_followed: 1, unanswered: 1 },
}

describe('the weekly digest (R57, R58)', () => {
  it('summarises the fixed week from its facts', () => {
    expect(digestWords(week)).toEqual({
      nights: 'Clarivi had readings from 6 of 7 nights, so this summary is based on those.',
      status: [
        'Your status was Ready on 2 days, Ease off on 2 days and Rest on 1 day.',
        'Ease off or Rest on Tuesday, Wednesday and Thursday.',
      ],
      readings: [
        'Heart rate variability was below your normal range on 2 of 5 nights.',
        'Sleep stayed in your normal range on all 5 nights.',
        'Sleeping heart rate was above your normal range on 1 of 5 nights.',
        'Several overnight readings moved the wrong way together on one night.',
      ],
      nudges: "The nudge asked for a change on 3 days: you followed it on 1, didn't on 1 and didn't answer on 1.",
    })
  })

  it('says when every night had data, and when a week was calm', () => {
    const calm: DigestFacts = {
      ...week,
      days_with_data: 7,
      statuses: { ready: 7, ease_off: 0, rest: 0, none: 0 },
      flagged: [],
      readings: { ...week.readings, hrv: { nights: 7, below: 0, above: 0, average: 52, normal: 52 } },
      pattern_nights: 0,
      nudges: { change_days: 0, followed: 0, not_followed: 0, unanswered: 0 },
    }
    const words = digestWords(calm)
    expect(words.nights).toBe('Clarivi had readings from all 7 nights.')
    expect(words.status).toEqual(['Your status was Ready on 7 days.'])
    expect(words.nudges).toBe('No nudge asked you to change anything this week.')
  })

  it('says plainly when there was nothing', () => {
    const empty: DigestFacts = {
      ...week,
      days_with_data: 0,
      statuses: { ready: 0, ease_off: 0, rest: 0, none: 7 },
      flagged: [],
      readings: {
        hrv: { nights: 0, below: 0, above: 0, average: null, normal: null },
        sleep: { nights: 0, below: 0, above: 0, average: null, normal: null },
        sleeping_hr: { nights: 0, below: 0, above: 0, average: null, normal: null },
      },
      pattern_nights: 0,
      nudges: { change_days: 0, followed: 0, not_followed: 0, unanswered: 0 },
    }
    const words = digestWords(empty)
    expect(words.nights).toBe('Clarivi had no readings from your Watch this week.')
    expect(words.status).toEqual(['There was no status on any day this week.'])
    expect(words.readings[0]).toBe('Heart rate variability had no readings that counted this week.')
  })

  it('names no condition and uses no em dashes', () => {
    const all = Object.values(digestWords(week)).flat().join(' ')
    expect(all).not.toContain('—')
    for (const term of FORBIDDEN_TERMS) expect(all.toLowerCase()).not.toMatch(term)
  })
})
