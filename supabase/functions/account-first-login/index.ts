// Sets the user's own password on first sign-in and clears the
// "must change password" flag in the same step, so the flag can only be
// cleared once a new password is saved (tech-spec section 6).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { adminClient, corsHeaders, json, mustChangePassword, publishableKey, supabaseUrl, userFromRequest } from '../_shared/http.ts'

const MIN_LENGTH = 12
const MAX_LENGTH = 72

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user || !user.email) return json({ error: 'not_signed_in' }, 401)
  if (!mustChangePassword(user)) return json({ error: 'not_required' }, 409)

  let password: unknown
  try {
    password = (await req.json()).password
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (typeof password !== 'string' || password.length < MIN_LENGTH) return json({ error: 'too_short' }, 400)
  if (password.length > MAX_LENGTH) return json({ error: 'too_long' }, 400)

  // Refuse the temporary password: if it still signs in, it hasn't changed.
  const probe = createClient(supabaseUrl(), publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: same } = await probe.auth.signInWithPassword({ email: user.email, password })
  if (same.session) {
    await probe.auth.signOut({ scope: 'local' })
    return json({ error: 'same_password' }, 400)
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...user.app_metadata, must_change_password: false },
  })
  if (error) {
    console.error('account-first-login: update failed', error.message)
    return json({ error: 'update_failed' }, 500)
  }
  return json({ ok: true })
})
