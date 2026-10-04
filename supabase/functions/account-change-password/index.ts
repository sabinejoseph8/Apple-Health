// Changes the signed-in user's password from Settings (R4): the current
// password is checked first, and the new one must be 12 to 72 characters
// and different. Saving a password ends every session, so the app signs
// straight back in with the new one.
import {
  adminClient,
  corsHeaders,
  json,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  mustChangePassword,
  passwordMatches,
  userFromRequest,
} from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user || !user.email) return json({ error: 'not_signed_in' }, 401)
  if (mustChangePassword(user)) return json({ error: 'must_change_password' }, 409)

  let body: { current?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const password = body.password
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return json({ error: 'too_short' }, 400)
  if (password.length > MAX_PASSWORD_LENGTH) return json({ error: 'too_long' }, 400)
  if (password === body.current) return json({ error: 'same_password' }, 400)
  if (!(await passwordMatches(user, body.current))) return json({ error: 'wrong_password' }, 401)

  const { error } = await admin.auth.admin.updateUserById(user.id, { password })
  if (error) {
    console.error('account-change-password: update failed', error.message)
    return json({ error: 'update_failed' }, 500)
  }
  return json({ ok: true })
})
