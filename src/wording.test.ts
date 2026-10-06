import { describe, expect, it } from 'vitest'
import { wording } from '../supabase/functions/_shared/wording'
import { FORBIDDEN_TERMS } from './lib/forbidden-terms'

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return [String(value(2)), String(value(1))]
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings)
  return []
}

// The fixed words only: sentence-building functions get placeholder words.
function fixedWords(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return [String(value('x', 'y', 'z'))]
  if (value && typeof value === 'object') return Object.values(value).flatMap(fixedWords)
  return []
}


const NO_HEALTH_DETAIL = ['heart', 'hrv', 'sleep', 'rest', 'ease off', 'ill', 'strain', 'breath', 'ready']

describe('wording', () => {
  const texts = allStrings(wording)

  it('has text to test', () => {
    expect(texts.length).toBeGreaterThan(10)
  })

  it('never uses em dashes', () => {
    for (const t of texts) expect(t).not.toContain('—')
  })

  // Sabine's wording review (6 October 2026, D85): "normal" sounds clinical,
  // so no screen or notification says it; "your usual range" instead.
  it('never says "normal" (D85)', () => {
    for (const t of texts) expect(t).not.toMatch(/\bnormal/i)
  })

  it('never names a condition (R61)', () => {
    for (const t of texts) for (const term of FORBIDDEN_TERMS) expect(t.toLowerCase()).not.toMatch(term)
  })

  it('keeps numbers out of every part of the briefing (R21)', () => {
    for (const t of fixedWords(wording.briefing)) expect(t).not.toMatch(/\d/)
  })

  it('keeps health detail out of the test, reminder and follow-up notifications (R49, R50)', () => {
    const p = wording.push
    for (const text of [`${p.testTitle} ${p.testBody}`, `${p.reminderTitle} ${p.reminder}`, `${p.followUpTitle} ${p.followUp}`]) {
      for (const word of NO_HEALTH_DETAIL) expect(text.toLowerCase()).not.toContain(word)
    }
  })

  it('uses the agreed reminder and follow-up text (R49, R50)', () => {
    expect(wording.push.reminder).toBe("No sync yet this morning. Run your readiness Shortcut before noon to get today's nudge.")
    expect(wording.push.followUp).toBe("Did you follow today's nudge?")
  })
})
