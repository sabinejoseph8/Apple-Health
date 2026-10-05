import { useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import ConsentText from '../components/ConsentText'
import { giveConsent } from '../lib/consent'
import { forgetThisDevice } from '../lib/push'
import { supabase } from '../lib/supabase'

const w = wording.consent

// Shown once, after the first sign-in and new password, before anything else
// (D79). Two separate statements, neither ticked in advance; "I agree" works
// only with both. Signing out is always there, so not agreeing costs nothing.
export default function Consent({ onAgreed }: { onAgreed: () => void }) {
  const [use, setUse] = useState(false)
  const [us, setUs] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function agree() {
    if (!use || !us) return setError(w.needBoth)
    setBusy(true)
    setError(null)
    try {
      await giveConsent()
      onAgreed()
    } catch {
      setError(wording.general.offline)
      setBusy(false)
    }
  }

  async function signOut() {
    try {
      await forgetThisDevice()
    } catch {
      // Sign out anyway; the phone may have no subscription.
    }
    await supabase.auth.signOut({ scope: 'local' })
  }

  return (
    <main className="page consent">
      <h1 className="large-title">{w.title}</h1>
      <ConsentText />
      <section className="card" aria-labelledby="agree-h">
        <h2 id="agree-h" className="section-headline">
          {w.agreeTitle}
        </h2>
        <label className="check">
          <input type="checkbox" checked={use} onChange={(e) => (setUse(e.target.checked), setError(null))} />
          <span>{w.agreeUse}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={us} onChange={(e) => (setUs(e.target.checked), setError(null))} />
          <span>{w.agreeUs}</span>
        </label>
        <button className="primary" type="button" onClick={agree} disabled={busy}>
          {busy ? w.agreeing : w.agree}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="text-button" type="button" onClick={signOut} disabled={busy}>
          {w.signOut}
        </button>
      </section>
      <p className="footnote">{w.versionLine}</p>
    </main>
  )
}
