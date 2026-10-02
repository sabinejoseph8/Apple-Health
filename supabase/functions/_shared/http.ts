// Shared helpers for the server functions: CORS for calls from the web app,
// JSON replies, and the Supabase clients.
import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2'

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

function keyFromEnv(jsonName: string, legacyName: string): string {
  const raw = Deno.env.get(jsonName)
  if (raw) {
    try {
      const keys = JSON.parse(raw)
      if (typeof keys.default === 'string') return keys.default
    } catch {
      // fall through to the older single-key setting
    }
  }
  const legacy = Deno.env.get(legacyName)
  if (!legacy) throw new Error(`missing ${jsonName} / ${legacyName}`)
  return legacy
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
