import { describe, expect, it } from 'vitest'
import { PUBLIC_VALUES, pickPublicValues } from './env-config'

describe('public build values', () => {
  it('never reads a secret value', () => {
    const names = Object.values(PUBLIC_VALUES).flat()
    for (const n of names) {
      expect(n).not.toMatch(/SECRET|SERVICE_ROLE|PASSWORD|JWT|POSTGRES|PRIVATE/)
    }
  })

  it('maps the integration names to the app names', () => {
    const v = pickPublicValues({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      SUPABASE_SECRET_KEY: 'sb_secret_x',
    })
    expect(v).toEqual({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      VITE_VAPID_PUBLIC_KEY: '',
    })
  })
})
