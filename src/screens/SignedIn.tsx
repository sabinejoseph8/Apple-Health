import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { currentPushSupport, refreshSubscription } from '../lib/push'
import { useRoute } from '../lib/route'
import { noteNotificationTap } from '../lib/today'
import Settings from './Settings'
import Today, { type PushState } from './Today'
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

    // Opened from a notification: "?n=<id>" records the tap (R51), then
    // leaves the address.
    const id = Number(new URLSearchParams(window.location.search).get('n'))
    if (id > 0) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
      noteNotificationTap(id)
        .then((kind) => kind === 'followup' && setFromFollowUp(true))
        .catch(() => undefined)
    }
  }, [])

  switch (route) {
    case 'today':
      return <Today push={push} fromFollowUp={fromFollowUp} />
    case 'why':
      return <WhyToday />
    case 'settings':
      return <Settings session={session} />
  }
}
