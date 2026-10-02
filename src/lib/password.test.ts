import { describe, expect, it } from 'vitest'
import { wording } from '../../supabase/functions/_shared/wording'
import { checkNewPassword } from './password'

describe('checkNewPassword', () => {
  it('refuses passwords under 12 characters', () => {
    expect(checkNewPassword('elevenchars', 'elevenchars')).toBe(wording.setPassword.tooShort)
  })
  it('refuses passwords over 72 characters', () => {
    const long = 'x'.repeat(73)
    expect(checkNewPassword(long, long)).toBe(wording.setPassword.tooLong)
  })
  it('refuses two different entries', () => {
    expect(checkNewPassword('twelve chars', 'twelve charz')).toBe(wording.setPassword.mismatch)
  })
  it('accepts 12 matching characters', () => {
    expect(checkNewPassword('twelve chars', 'twelve chars')).toBeNull()
  })
})
