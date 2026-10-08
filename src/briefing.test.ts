import { describe, expect, it } from 'vitest'
import {
  alsoChecked,
  briefing,
  type DayWords,
  formatDuration,
  headline,
  learningLastNight,
  morningNotification,
  type Reading,
  type ReadingPoints,
  type Status,
  whySummary,
} from '../supabase/functions/_shared/briefing'
import { notCounted, reading, sampleDay } from './lib/sample-days'
import { FORBIDDEN_TERMS } from './lib/forbidden-terms'

// The design canvas's words, except where Sabine's wording review (6 October
// 2026) replaced "normal for you" with "your usual range".
describe('the design sample day (Tuesday 29 September)', () => {
  it('has the designed headline', () => {
    expect(headline(sampleDay)).toBe("A short night, and your body hasn't fully recovered")
  })

  it('has the designed briefing, word for word', () => {
    expect(briefing(sampleDay).join(' ')).toBe(
      'You slept much less than usual, and your heart rate variability was below your usual range. ' +
        'Together, those usually mean your body is still recovering. ' +
        'Your heart rate while you slept was in your usual range, and there was no early sign of illness or heavy strain.',
    )
  })

  it('has the morning notification from R48', () => {
    expect(morningNotification(sampleDay)).toBe('Ease off today: HRV well below your usual, sleep short')
  })

  it("has Why today's designed summary", () => {
    expect(whySummary(sampleDay)).toEqual({
      headline: 'Two of your three recovery readings were low last night',
      body: [
        'Your heart rate variability and sleep were both below your usual range.',
        'Your sleeping heart rate was in your usual range.',
      ],
    })
  })
})

describe("Why today's other words", () => {
  it('has the designed "Also checked" sentence (R39)', () => {
    expect(alsoChecked({ value: 14.8, verdict: 'in_range' }, { value: 55, verdict: 'in_range' }, 'clear')).toEqual([
      "Your breathing rate while asleep (14.8 breaths a minute) and yesterday's resting heart rate (55 bpm) were both in your usual range, so there is no early sign of illness or heavy strain.",
    ])
  })

  it('only says "no early sign" when the illness check ran (R33)', () => {
    for (const illness of ['fired', 'not_run'] as const) {
      const text = alsoChecked({ value: 14.8, verdict: 'in_range' }, { value: 55, verdict: 'in_range' }, illness).join(' ')
      expect(text).not.toContain('no early sign')
    }
  })

  it('names a reading that was off, and one that is missing', () => {
    expect(alsoChecked({ value: 17.2, verdict: 'above' }, { value: null, verdict: 'missing' }, 'not_run')).toEqual([
      'Your breathing rate while asleep (17.2 breaths a minute) was above your usual range.',
      'There was no resting heart rate reading for yesterday.',
      "There weren't enough readings to check how they moved together.",
    ])
  })

  it('on a past day, speaks of that night and the previous day (D88)', () => {
    expect(alsoChecked({ value: null, verdict: 'missing' }, { value: 58, verdict: 'above' }, 'not_run', true)).toEqual([
      'There was no breathing rate reading that night.',
      "The previous day's resting heart rate (58 bpm) was above your usual range.",
      "There weren't enough readings to check how they moved together.",
    ])
    expect(alsoChecked({ value: 14.8, verdict: 'in_range' }, { value: null, verdict: 'missing' }, 'not_run', true)).toContain(
      'There was no resting heart rate reading for the previous day.',
    )
    expect(alsoChecked({ value: 17.2, verdict: 'above' }, { value: 64, verdict: 'above' }, 'fired', true)).toContain(
      'Several of your overnight readings moved the wrong way together that night.',
    )
  })

  it('writes sleep the way the design does', () => {
    expect(formatDuration(430)).toBe('7h 10m')
    expect(formatDuration(45)).toBe('45m')
  })

  it("gives last night's values in plain words while learning your normal (R32)", () => {
    expect(learningLastNight({ asleep_min: 370, hrv: 41.6, sleeping_hr: 55 })).toBe(
      'Last night you slept 6h 10m, your heart rate variability was 42 ms, and your heart rate while you slept was 55 bpm.',
    )
  })
})

describe('other days', () => {
  it('says nothing about illness or strain when the check could not run (R33)', () => {
    const day = { ...sampleDay, composite_fired: null }
    expect(briefing(day).join(' ')).not.toContain('illness')
  })

  it('describes a pattern, never a condition, when the check fires (R33)', () => {
    const text = briefing({ ...sampleDay, composite_fired: true }).join(' ')
    expect(text).toContain('several of your overnight readings moved the wrong way together')
    expect(text).not.toContain('no early sign')
  })

  it('names a missing reading on a day from 2 of 3 readings (R30)', () => {
    const day: DayWords = {
      ...sampleDay,
      readings_used: 2,
      points: { ...sampleDay.points, hrv: notCounted('missing') },
    }
    expect(briefing(day).join(' ')).toContain("your Watch didn't record your heart rate variability")
    expect(whySummary(day).headline).toBe('One of your two recovery readings was low last night')
    expect(whySummary(day).body).toContain("Your Watch didn't record your heart rate variability last night.")
    // On a past day (D88), the same said about that night.
    expect(whySummary(day, true).headline).toBe('One of your two recovery readings was low that night')
    expect(whySummary(day, true).body).toContain("Your Watch didn't record your heart rate variability that night.")
  })

  it('reads as calm on a normal day', () => {
    const day: DayWords = {
      status: 'ready',
      readings_used: 3,
      reason_codes: [],
      composite_fired: false,
      points: { hrv: reading('hrv', 52, 52, 6), sleep: reading('sleep', 430, 430, 34), sleeping_hr: reading('sleeping_hr', 50, 50, 2.5) },
    }
    expect(headline(day)).toBe('Your readings are all in your usual range')
    expect(briefing(day)).toEqual([
      'Your sleep, heart rate variability and heart rate while you slept were all in your usual range.',
      'Your body looks ready for whatever you have planned.',
      'There was no early sign of illness or heavy strain.',
    ])
    expect(morningNotification(day)).toBe('Ready today: your readings are in your usual range')
    expect(whySummary(day).headline).toBe('All three of your recovery readings were in your usual range last night')
    expect(whySummary(day, true).headline).toBe('All three of your recovery readings were in your usual range that night')
  })

  it('leads with sleep when sleep earns the most points on a sleep-led day', () => {
    const day: DayWords = {
      status: 'ease_off',
      readings_used: 3,
      reason_codes: ['sleep_outside_range'],
      composite_fired: false,
      points: { hrv: reading('hrv', 52, 52, 6), sleep: reading('sleep', 250, 430, 34), sleeping_hr: reading('sleeping_hr', 50, 50, 2.5) },
    }
    expect(headline(day)).toBe('A short night, so take it a little easier')
    expect(briefing(day)[1]).toBe('A short night can leave you less ready for a hard session.')
    expect(morningNotification(day)).toBe('Ease off today: sleep short')
  })

  it('is honest about a short night on a Ready day', () => {
    const day: DayWords = {
      status: 'ready',
      readings_used: 3,
      reason_codes: ['sleep_outside_range'],
      composite_fired: false,
      points: { hrv: reading('hrv', 52, 52, 6), sleep: reading('sleep', 340, 430, 34), sleeping_hr: reading('sleeping_hr', 50, 50, 2.5) },
    }
    expect(headline(day)).toBe('A short night, but the rest looks as usual')
    expect(morningNotification(day)).toBe('Ready today: sleep short, but the rest looks as usual')
  })

  it('leads with good news when a reading was better than normal', () => {
    const day: DayWords = {
      status: 'ready',
      readings_used: 3,
      reason_codes: [],
      composite_fired: null,
      points: { hrv: reading('hrv', 66, 52, 6), sleep: reading('sleep', 430, 430, 34), sleeping_hr: reading('sleeping_hr', 50, 50, 2.5) },
    }
    expect(headline(day)).toBe('Your readings are in your usual range or better')
    expect(briefing(day)[0]).toBe(
      'Your heart rate variability was above your usual range, and your sleep and heart rate while you slept were both in your usual range.',
    )
  })

  it('gives no notification text on a day without a status (R48)', () => {
    expect(morningNotification({ ...sampleDay, status: 'none' })).toBeNull()
  })
})

// Every combination of how each reading went, for each status and each
// illness-check result, must keep to the wording rules (R21, R33, R61).
describe('the wording rules hold for every day', () => {
  const kinds: Record<string, (r: Reading) => ReadingPoints> = {
    worse: (r) => (r === 'sleeping_hr' ? reading(r, 57, 50, 2.5) : r === 'hrv' ? reading(r, 36, 52, 6) : reading(r, 340, 430, 34)),
    slight: (r) => (r === 'sleeping_hr' ? reading(r, 53, 50, 2.5) : r === 'hrv' ? reading(r, 44, 52, 6) : reading(r, 390, 430, 34)),
    normal: (r) => (r === 'sleeping_hr' ? reading(r, 50, 50, 2.5) : r === 'hrv' ? reading(r, 52, 52, 6) : reading(r, 430, 430, 34)),
    better: (r) => (r === 'sleeping_hr' ? reading(r, 44, 50, 2.5) : r === 'hrv' ? reading(r, 66, 52, 6) : reading(r, 510, 430, 34)),
    missing: () => notCounted('missing'),
    building: (r) => notCounted('building', r === 'sleep' ? 400 : 50),
  }
  const days: DayWords[] = []
  for (const status of ['ready', 'ease_off', 'rest'] as Status[])
    for (const h of Object.keys(kinds))
      for (const s of Object.keys(kinds))
        for (const shr of Object.keys(kinds))
          for (const composite of [true, false, null]) {
            const points = { hrv: kinds[h]('hrv'), sleep: kinds[s]('sleep'), sleeping_hr: kinds[shr]('sleeping_hr') }
            const used = Object.values(points).filter((p) => p.counted).length
            days.push({ status, points, readings_used: used, reason_codes: [], composite_fired: composite })
          }

  it(`covers ${days.length} days`, () => {
    expect(days.length).toBe(3 * 6 * 6 * 6 * 3)
  })

  it('has a headline and at most three sentences, each a whole sentence', () => {
    for (const day of days) {
      expect(headline(day).length).toBeGreaterThan(0)
      const sentences = briefing(day)
      expect(sentences.length).toBeGreaterThan(0)
      expect(sentences.length).toBeLessThanOrEqual(3)
      for (const s of sentences) expect(s).toMatch(/^[A-Z][^.]*\.$/)
    }
  })

  it('has no numbers in the headline or briefing', () => {
    for (const day of days) expect(`${headline(day)} ${briefing(day).join(' ')}`).not.toMatch(/\d/)
  })

  it('names no condition and uses no em dashes', () => {
    for (const day of days) {
      const text = `${headline(day)} ${briefing(day).join(' ')} ${whySummary(day).headline} ${whySummary(day).body.join(' ')}`
      expect(text).not.toContain('—')
      for (const term of FORBIDDEN_TERMS) expect(text.toLowerCase()).not.toMatch(term)
    }
  })

  it('only says "no early sign of illness" when the illness check ran and found nothing (R33)', () => {
    for (const day of days) {
      if (briefing(day).join(' ').includes('no early sign')) expect(day.composite_fired).toBe(false)
    }
  })
})
