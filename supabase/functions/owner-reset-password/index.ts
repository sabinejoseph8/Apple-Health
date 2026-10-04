// The owner resets a tester's password (R63, D74): gives them a new
// temporary password and sets the change-password flag, so they must choose
// their own at the next sign-in (R3). Only the owner can use it; it works
// out who is asking from the session. Saving a password ends that person's
// sessions. Never logs the email or the password.
import {
  adminClient,
  corsHeaders,
  json,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  userFromRequest,
} from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user) return json({ error: 'not_signed_in' }, 401)
  const { data: profile } = await admin.from('profiles').select('is_owner').eq('user_id', user.id).maybeSingle()
  if (profile?.is_owner !== true) return json({ error: 'not_owner' }, 403)

  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = body.password
  if (!email) return json({ error: 'no_email' }, 400)
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return json({ error: 'too_short' }, 400)
  if (password.length > MAX_PASSWORD_LENGTH) return json({ error: 'too_long' }, 400)

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) return json({ error: 'lookup_failed' }, 500)
  const target = list.users.find((u) => u.email?.toLowerCase() === email)
  if (!target) return json({ error: 'not_found' }, 404)
  // The owner changes their own password in Settings instead.
  if (target.id === user.id) return json({ error: 'own_account' }, 400)

  const { error } = await admin.auth.admin.updateUserById(target.id, {
    password,
    app_metadata: { ...target.app_metadata, must_change_password: true },
  })
  if (error) {
    console.error('owner-reset-password: update failed', error.message)
    return json({ error: 'update_failed' }, 500)
  }
  console.log('owner-reset-password: one password reset')
  return json({ ok: true })
})
