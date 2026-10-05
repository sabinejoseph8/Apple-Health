import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { wording } from '../supabase/functions/_shared/wording'
import { useRoute } from './lib/route'
import { configured, supabase } from './lib/supabase'
import { screenFor } from './lib/screens'
import Guide from './screens/Guide'
import SignIn from './screens/SignIn'
import SetPassword from './screens/SetPassword'
import SignedIn from './screens/SignedIn'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const route = useRoute()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!configured) {
    return (
      <main className="page">
        <h1 className="large-title">{wording.appName}</h1>
        <p className="body">{wording.general.notConfigured}</p>
      </main>
    )
  }
  // The setup guide is for before signing in too (D78).
  if (route === 'guide') return <Guide />
  if (!ready) return <main className="page" aria-busy="true" />

  switch (screenFor(session)) {
    case 'sign-in':
      return <SignIn />
    case 'set-password':
      return <SetPassword session={session!} />
    case 'home':
      return <SignedIn key={session!.user.id} session={session!} />
  }
}
