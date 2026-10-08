import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LoadFailed } from '../components/LoadState'
import { CONSENT_CHANGED, consentCurrent, loadConsent } from '../lib/consent'
import { useRoute } from '../lib/route'
import Consent from './Consent'
import Guide from './Guide'
import Privacy from './Privacy'
import SignedIn from './SignedIn'

// Nothing of the signed-in app opens until the person has agreed to the
// current consent text (D79); after withdrawing (D80) it asks again.
export default function ConsentGate({ session }: { session: Session }) {
  const [state, setState] = useState<'checking' | 'failed' | 'needed' | 'given'>('checking')
  const route = useRoute()

  const check = useCallback(async () => {
    setState('checking')
    try {
      setState(consentCurrent(await loadConsent()) ? 'given' : 'needed')
    } catch {
      setState('failed')
    }
  }, [])

  useEffect(() => {
    check()
    window.addEventListener(CONSENT_CHANGED, check)
    return () => window.removeEventListener(CONSENT_CHANGED, check)
  }, [check])

  // The public guide and "Your data" open before agreeing too (D78, D79).
  if (state !== 'given' && route === 'guide') return <Guide />
  if (state !== 'given' && route === 'privacy') return <Privacy />
  if (state === 'checking') return <main className="page" aria-busy="true" />
  if (state === 'failed')
    return (
      <main className="page">
        <LoadFailed onRetry={check} />
      </main>
    )
  if (state === 'needed') return <Consent onAgreed={() => setState('given')} />
  return <SignedIn session={session} />
}
