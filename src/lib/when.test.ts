import { describe, expect, it } from 'vitest'
import { formatWhen, nextDigestDay } from './when'

// Dates are built in the test machine's own time zone, like the phone's.
const now = new Date(2026, 9, 3, 9, 15)

describe('formatWhen', () => {
  it('says "today" for a time earlier today', () => {
    expect(formatWhen(new Date(2026, 9, 3, 6, 42).toISOString(), now)).toBe('today at 6:42am')
  })

  it('says "yesterday" for a time yesterday', () => {
    expect(formatWhen(new Date(2026, 9, 2, 6, 51).toISOString(), now)).toBe('yesterday at 6:51am')
  })

  it('gives the day and month for another day', () => {
    expect(formatWhen(new Date(2026, 9, 1, 18, 5).toISOString(), now)).toBe('1 Oct at 6:05pm')
  })

  it('writes midnight and noon as 12', () => {
    expect(formatWhen(new Date(2026, 8, 30, 0, 0).toISOString(), now)).toBe('30 Sep at 12:00am')
    expect(formatWhen(new Date(2026, 8, 30, 12, 30).toISOString(), now)).toBe('30 Sep at 12:30pm')
  })
})

describe('nextDigestDay', () => {
  const day = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()]
  it('is the coming Monday during the week', () => {
    expect(day(nextDigestDay(new Date(2026, 8, 29, 9, 0)))).toEqual([2026, 10, 5]) // Tuesday
    expect(day(nextDigestDay(new Date(2026, 9, 4, 20, 0)))).toEqual([2026, 10, 5]) // Sunday evening
  })
  it('is today on a Monday morning, and next Monday from noon', () => {
    expect(day(nextDigestDay(new Date(2026, 9, 5, 5, 30)))).toEqual([2026, 10, 5])
    expect(day(nextDigestDay(new Date(2026, 9, 5, 12, 0)))).toEqual([2026, 10, 12])
  })
})
