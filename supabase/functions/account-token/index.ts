// Creates or reissues the signed-in user's upload token (R8, R10, R11).
// Only after the person has agreed to the consent text (D79). The password
// is checked first. The token is returned once and only its
// hash is stored; reissuing stops the old token working in the same step.
import { adminClient, corsHeaders, json, mustChangePassword, passwordMatches, userFromRequest } from '../_shared/http.ts'
import { generateUploadToken, hashToken } from '../_shared/tokens.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user || !user.email) return json({ error: 'not_signed_in' }, 401)
  if (mustChangePassword(user)) return json({ error: 'must_change_password' }, 409)

  const { data: agreed, error: consentError } = await admin.rpc('has_consent', { p_user: user.id })
  if (consentError) {
    console.error('account-token: consent check failed', consentError.message)
    return json({ error: 'issue_failed' }, 500)
  }
  if (agreed !== true) return json({ error: 'no_consent' }, 403)

  let password: unknown
  try {
    password = (await req.json()).password
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!(await passwordMatches(user, password))) return json({ error: 'wrong_password' }, 401)

  const token = generateUploadToken()
  const { data: createdAt, error } = await admin.rpc('issue_upload_token', {
    p_user: user.id,
    p_token_hash: await hashToken(token),
  })
  if (error) {
    console.error('account-token: issue failed', error.message)
    return json({ error: 'issue_failed' }, 500)
  }
  return json({ token, created_at: createdAt })
})
