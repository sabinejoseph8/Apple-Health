// Creates or reissues the signed-in user's upload token (R8, R10, R11).
// The password is checked first. The token is returned once and only its
// hash is stored; reissuing stops the old token working in the same step.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { adminClient, corsHeaders, json, mustChangePassword, publishableKey, supabaseUrl, userFromRequest } from '../_shared/http.ts'
import { generateUploadToken, hashToken } from '../_shared/tokens.ts'

const MAX_PASSWORD_LENGTH = 72

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
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return json({ error: 'wrong_password' }, 401)
  }

  // Password re-check: Supabase's own re-authentication sends an email code,
  // and this app has no email, so sign in with the password instead
  // (tech-spec section 6).
  const probe = createClient(supabaseUrl(), publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: check } = await probe.auth.signInWithPassword({ email: user.email, password })
  if (!check.session || check.user?.id !== user.id) return json({ error: 'wrong_password' }, 401)
  await probe.auth.signOut({ scope: 'local' })

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
