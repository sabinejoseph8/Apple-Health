import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { currentPushSupport, refreshSubscription } from '../lib/push'
import { dayFrom, useRoute } from '../lib/route'
import { endIfSignedOutElsewhere } from '../lib/session'
import { noteNotificationTap } from '../lib/today'
import Digest from './Digest'
import Owner from './Owner'
import Settings from './Settings'
import Today, { type PushState } from './Today'
import Trends from './Trends'
import WhyToday, { DayView } from './WhyToday'

// The signed-in app: the card, Why today and Settings.
export default function SignedIn({ session }: { session: Session }) {
  const route = useRoute()
  const [push, setPush] = useState<PushState | null>(null)
  const [fromFollowUp, setFromFollowUp] = useState(false)

  // Each time the app opens or comes back to the front, check the sign-in
  // still stands (R7).
  useEffect(() => {
    endIfSignedOutElsewhere().catch(() => undefined)
    const onVisible = () => document.visibilityState === 'visible' && endIfSignedOutElsewhere().catch(() => undefined)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

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
    case 'owner':
      return <Owner />
    case 'day': {
      // A past day (D88); keyed by date so stepping to another day reloads.
      const date = dayFrom(window.location.hash)
      return date ? <DayView key={date} date={date} /> : <Today push={push} fromFollowUp={fromFollowUp} />
    }
  }
}
