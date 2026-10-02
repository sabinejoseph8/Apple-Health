import { describe, expect, it } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { screenFor } from './screens'

const session = (appMetadata: Record<string, unknown>) =>
  ({ user: { id: 'u1', app_metadata: appMetadata } }) as unknown as Session

describe('screenFor', () => {
  it('shows sign-in when nobody is signed in', () => {
    expect(screenFor(null)).toBe('sign-in')
  })
  it('shows "Set a new password" while the temporary password is in use (R3)', () => {
    expect(screenFor(session({ must_change_password: true }))).toBe('set-password')
  })
  it('shows home once the password has been changed', () => {
    expect(screenFor(session({ must_change_password: false }))).toBe('home')
    expect(screenFor(session({}))).toBe('home')
  })
})
