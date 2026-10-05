// Shared helpers for the server functions: CORS for calls from the web app,
// JSON replies, and the Supabase clients.
import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2'

export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 72

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Supabase gives functions a project's keys as a list by name, such as
// {"default": "sb_secret_..."}. The one named "default" is used. Once a key
// has been replaced (D81), the list may hold only the new one, under the name
// it was given, so any listed key will do. The older single-key setting is
// the last resort.
export function pickKey(listed: string | undefined, legacy: string | undefined, what: string): string {
  if (listed) {
    try {
      const keys: Record<string, unknown> = JSON.parse(listed)
      if (typeof keys.default === 'string') return keys.default
      const named = Object.values(keys).find((k): k is string => typeof k === 'string' && k !== '')
      if (named) return named
    } catch {
      // fall through to the older single-key setting
    }
  }
  if (!legacy) throw new Error(`missing ${what}`)
  return legacy
}

function keyFromEnv(jsonName: string, legacyName: string): string {
  return pickKey(Deno.env.get(jsonName), Deno.env.get(legacyName), `${jsonName} / ${legacyName}`)
}

export function supabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL')!
}

export function publishableKey(): string {
  return keyFromEnv('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
}

// Elevated access. Only used inside named functions, never sent anywhere.
export function adminClient(): SupabaseClient {
  return createClient(supabaseUrl(), keyFromEnv('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Works out the user from the session token sent by the app. Never trusts a
// user id from the request body.
export async function userFromRequest(req: Request, admin: SupabaseClient): Promise<User | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

export function mustChangePassword(user: User): boolean {
  return user.app_metadata?.must_change_password === true
}

// Password re-check before a sensitive action (R8): Supabase's own
// re-authentication sends an email code, and this app has no email, so sign
// in with the password instead (tech-spec section 6). The trial session is
// signed out at once.
export async function passwordMatches(user: User, password: unknown): Promise<boolean> {
  if (!user.email || typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return false
  const probe = createClient(supabaseUrl(), publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data } = await probe.auth.signInWithPassword({ email: user.email, password })
  if (!data.session) return false
  await probe.auth.signOut({ scope: 'local' })
  return data.user?.id === user.id
}
