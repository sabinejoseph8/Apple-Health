import { describe, expect, it } from 'vitest'
import { wording } from '../supabase/functions/_shared/wording'

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return [String(value(2)), String(value(1))]
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings)
  return []
}

describe('wording', () => {
  const texts = allStrings(wording)

  it('has text to test', () => {
    expect(texts.length).toBeGreaterThan(10)
  })

  it('never uses em dashes', () => {
    for (const t of texts) expect(t).not.toContain('—')
  })

  it('keeps health detail out of the test notification (lock-screen privacy)', () => {
    const lockScreen = `${wording.push.testTitle} ${wording.push.testBody}`.toLowerCase()
    for (const word of ['heart', 'hrv', 'sleep', 'rest', 'ease off', 'ill', 'strain', 'breath']) {
      expect(lockScreen).not.toContain(word)
    }
  })
})
