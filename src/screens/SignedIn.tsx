import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { currentPushSupport, refreshSubscription } from '../lib/push'
import { useRoute } from '../lib/route'
import { noteNotificationTap } from '../lib/today'
import Digest from './Digest'
import Settings from './Settings'
import Today, { type PushState } from './Today'
import Trends from './Trends'
import WhyToday from './WhyToday'

// The signed-in app: the card, Why today and Settings.
export default function SignedIn({ session }: { session: Session }) {
  const route = useRoute()
  const [push, setPush] = useState<PushState | null>(null)
  const [fromFollowUp, setFromFollowUp] = useState(false)

  useEffect(() => {
    // Re-register this phone for notifications each time the app opens, so a
    // renewed subscription is never missed (Phase 1a).
    refreshSubscription()
      .then((subscribed) => setPush({ support: currentPushSupport(), subscribed }))
      .catch(() => setPush({ support: currentPushSupport(), subscribed: false }))

    // Opened from a notification: "?n=<id>&k=<kind>" records the tap (R51),
    // and an answer after the 8pm one counts as given there (R56). Then the
    // address is tidied.
    const params = new URLSearchParams(window.location.search)
    const id = Number(params.get('n'))
    if (id > 0) {
      noteNotificationTap(id)
      if (params.get('k') === 'followup') setFromFollowUp(true)
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    }
  }, [])

  switch (route) {
    case 'today':
      return <Today push={push} fromFollowUp={fromFollowUp} />
    case 'why':
      return <WhyToday />
    case 'settings':
      return <Settings session={session} />
    case 'trends':
      return <Trends />
    case 'digest':
      return <Digest />
  }
}
