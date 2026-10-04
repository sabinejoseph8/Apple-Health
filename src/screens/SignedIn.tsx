import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { refreshSubscription } from '../lib/push'
import { useRoute } from '../lib/route'
import Settings from './Settings'
import Today from './Today'
import WhyToday from './WhyToday'

// The signed-in app: the card, Why today and Settings.
export default function SignedIn({ session }: { session: Session }) {
  const route = useRoute()

  // Re-register this phone for notifications each time the app opens, so a
  // renewed subscription is never missed (Phase 1a).
  useEffect(() => {
    refreshSubscription().catch(() => undefined)
  }, [])

  switch (route) {
    case 'today':
      return <Today />
    case 'why':
      return <WhyToday />
    case 'settings':
      return <Settings session={session} />
  }
}
