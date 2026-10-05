// "Withdraw consent" (D80): once the password is checked, deletes all of the
// signed-in user's data, as Delete my data does, and ends their agreement to
// the consent text, keeping its record. Nothing more is collected; using
// Clarivi again means agreeing again. The account itself stays.
import { adminClient, corsHeaders, json, mustChangePassword, passwordMatches, userFromRequest } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user || !user.email) return json({ error: 'not_signed_in' }, 401)
  if (mustChangePassword(user)) return json({ error: 'must_change_password' }, 409)

  let password: unknown
  try {
    password = (await req.json()).password
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!(await passwordMatches(user, password))) return json({ error: 'wrong_password' }, 401)

  const { error } = await admin.rpc('withdraw_consent', { p_user: user.id })
  if (error) {
    console.error('account-withdraw-consent: withdraw failed', error.message)
    return json({ error: 'withdraw_failed' }, 500)
  }
  console.log("account-withdraw-consent: one account's consent withdrawn and data deleted")
  return json({ ok: true })
})
