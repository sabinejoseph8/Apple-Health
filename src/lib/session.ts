import { forgetThisDevice } from './push'
import { supabase } from './supabase'

// When this device's sign-in has been ended elsewhere ("Sign out
// everywhere", R7), the server refuses it at once: go straight to the
// sign-in screen, and stop this device's notifications so a signed-out
// person's status never shows on its lock screen. No reply (offline) or a
// server fault is not a sign-out.
export async function endIfSignedOutElsewhere(): Promise<void> {
  const { error } = await supabase.auth.getUser()
  if (!error || !error.status || error.status >= 500) return
  try {
    await forgetThisDevice()
  } catch {
    // Sign out anyway; the phone may already have no subscription.
  }
  await supabase.auth.signOut({ scope: 'local' })
}
