import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { wording } from '../supabase/functions/_shared/wording'
import { useRoute } from './lib/route'
import { configured, supabase } from './lib/supabase'
import { screenFor } from './lib/screens'
import ConsentGate from './screens/ConsentGate'
import Guide from './screens/Guide'
import Privacy from './screens/Privacy'
import SignIn from './screens/SignIn'
import SetPassword from './screens/SetPassword'

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
  // The setup guide and "Your data" are for before signing in too (D78, D79).
  if (route === 'guide') return <Guide />
  if (route === 'privacy') return <Privacy />
  if (!ready) return <main className="page" aria-busy="true" />

  switch (screenFor(session)) {
    case 'sign-in':
      return <SignIn />
    case 'set-password':
      return <SetPassword session={session!} />
    case 'home':
      // Consent comes before anything else (D79).
      return <ConsentGate key={session!.user.id} session={session!} />
  }
}
