import { describe, expect, it } from 'vitest'
import { formatWhen } from './when'

// Dates are built in the test machine's own time zone, like the phone's.
const now = new Date(2026, 9, 3, 9, 15)

describe('formatWhen', () => {
  it('says "today" for a time earlier today', () => {
    expect(formatWhen(new Date(2026, 9, 3, 6, 42).toISOString(), now)).toBe('today at 6:42am')
  })

  it('gives the day and month for another day', () => {
    expect(formatWhen(new Date(2026, 9, 1, 18, 5).toISOString(), now)).toBe('1 Oct at 6:05pm')
  })

  it('writes midnight and noon as 12', () => {
    expect(formatWhen(new Date(2026, 8, 30, 0, 0).toISOString(), now)).toBe('30 Sep at 12:00am')
    expect(formatWhen(new Date(2026, 8, 30, 12, 30).toISOString(), now)).toBe('30 Sep at 12:30pm')
  })
})
