// The only values the build passes to the browser. Vercel's Supabase
// integration also stores secret values (secret key, database password,
// token-signing secret); none of those names may ever appear here.
export const PUBLIC_VALUES = {
  VITE_SUPABASE_URL: ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'],
  VITE_SUPABASE_PUBLISHABLE_KEY: [
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
  ],
  VITE_VAPID_PUBLIC_KEY: ['VITE_VAPID_PUBLIC_KEY'],
} as const

export function pickPublicValues(env: Record<string, string | undefined>) {
  const out: Record<string, string> = {}
  for (const [target, names] of Object.entries(PUBLIC_VALUES)) {
    out[target] = names.map((n) => env[n]).find((v) => v) ?? ''
  }
  return out
}
