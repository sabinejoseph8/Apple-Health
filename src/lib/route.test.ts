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

  it('ignores a date that does not exist', () => {
    expect(dayFrom('#/day/2026-02-31')).toBeNull()
    expect(routeFrom('#/day/2026-02-31')).toBe('today')
    expect(routeFrom('#/day/2026-13-01')).toBe('today')
    expect(dayFrom('#/day/2028-02-29')).toBe('2028-02-29')
  })

  it('steps across months and years', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
