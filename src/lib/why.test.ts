import { describe, expect, it } from 'vitest'
import { bigValue, chartDates, fourWeeksText, rangeText, shortValue, totalText, vsNormalText, zoneNumber } from './why'

// The design's sample day, Why today with the numbers open.
describe('the numbers panel', () => {
  it('writes values the way the design does', () => {
    expect(bigValue('hrv', 38)).toEqual([{ number: '38', unit: 'ms' }])
    expect(bigValue('sleep', 352)).toEqual([
      { number: '5', unit: 'hr' },
      { number: '52', unit: 'min' },
    ])
    expect(shortValue('hrv', 52)).toBe('52 ms')
    expect(shortValue('sleep', 430)).toBe('7h 10m')
    expect(shortValue('sleeping_hr', 50)).toBe('50 bpm')
  })

  it('gives the normal range', () => {
    expect(rangeText('hrv', 40, 64)).toBe('40 to 64 ms')
    expect(rangeText('sleep', 362, 498)).toBe('6h 02m to 8h 18m')
  })

  it('compares last night with normal', () => {
    expect(vsNormalText('hrv', 38, 52)).toBe('14 ms lower')
    expect(vsNormalText('sleep', 352, 430)).toBe('1h 18m less')
    expect(vsNormalText('sleeping_hr', 51, 50)).toBe('1 bpm higher')
    expect(vsNormalText('hrv', 52.3, 51.8)).toBe('The same as normal')
  })

  it('compares last night with the last four weeks', () => {
    const nights = [50, 48, null, 55, 38].map((value, k) => ({ date: `2026-09-${25 + k}`, value }))
    expect(fourWeeksText(nights, 38)).toBe('Your lowest night')
    expect(fourWeeksText(nights.map((p, k) => (k === 4 ? { ...p, value: 60 } : p)), 60)).toBe('Your highest night')
    expect(fourWeeksText(nights.map((p, k) => (k === 4 ? { ...p, value: 49 } : p)), 49)).toBe('Lower than 2 of 3 nights')
    expect(fourWeeksText([{ date: '2026-09-29', value: 38 }], 38)).toBeNull()
  })

  it("never rounds today's total onto a zone's limit", () => {
    const zones = { ease_off_at: 1.2, rest_at: 2.4 }
    expect(totalText(1.64, zones)).toBe('1.6')
    expect(totalText(1.19, zones)).toBe('1.19')
    expect(totalText(2.38, zones)).toBe('2.38')
    expect(totalText(1.2, zones)).toBe('1.2')
    expect(totalText(0.04, zones)).toBe('0.0')
  })

  it('writes the zone numbers simply', () => {
    expect(zoneNumber(1.2)).toBe('1.2')
    expect(zoneNumber(2.4)).toBe('2.4')
    expect(zoneNumber(1)).toBe('1')
  })
})

describe('the chart', () => {
  it('covers the 28 nights ending last night', () => {
    const dates = chartDates('2026-09-29')
    expect(dates).toHaveLength(28)
    expect(dates[0]).toBe('2026-09-02')
    expect(dates[27]).toBe('2026-09-29')
  })
})
