import { describe, expect, it } from 'vitest'
import { addDays } from './day'
import { dayFrom, routeFrom } from './route'

// D88: a past day's address.
describe('past days', () => {
  it('reads a past day from the address', () => {
    expect(routeFrom('#/day/2026-10-06')).toBe('day')
    expect(dayFrom('#/day/2026-10-06')).toBe('2026-10-06')
  })

  it('ignores anything that is not a date', () => {
    expect(routeFrom('#/day/yesterday')).toBe('today')
    expect(dayFrom('#/why')).toBeNull()
    expect(routeFrom('#/why')).toBe('why')
  })

  it('steps across months and years', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
