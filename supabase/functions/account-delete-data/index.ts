// "Delete my data" (R59): once the password is checked, removes all of the
// signed-in user's readings, results, answers, logs, token and notification
// registrations. The account itself stays (tech-spec section 4).
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

  const { error } = await admin.rpc('delete_my_data', { p_user: user.id })
  if (error) {
    console.error('account-delete-data: delete failed', error.message)
    return json({ error: 'delete_failed' }, 500)
  }
  console.log('account-delete-data: one account\'s data deleted')
  return json({ ok: true })
})
