import type { Session } from '@supabase/supabase-js'

export type Screen = 'sign-in' | 'set-password' | 'home'

// Which screen a session gets. A temporary password must be replaced before
// anything else is shown (R3).
export function screenFor(session: Session | null): Screen {
  if (!session) return 'sign-in'
  if (session.user.app_metadata?.must_change_password === true) return 'set-password'
  return 'home'
}
