import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

export const configured = Boolean(url && key)

// Sessions stay signed in from day to day (R6), so tapping a notification
// never lands on the sign-in screen.
export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'clarivi-auth' },
})
