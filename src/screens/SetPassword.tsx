import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { wording } from '../../supabase/functions/_shared/wording'
import { checkNewPassword } from '../lib/password'
import { supabase } from '../lib/supabase'

const w = wording.setPassword

export default function SetPassword({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get('new-password') ?? '')
    const problem = checkNewPassword(password, String(form.get('confirm') ?? ''))
    if (problem) return setError(problem)

    setBusy(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('account-first-login', { body: { password } })
    if (error) {
      let code = ''
      try {
        code = (await (error as { context?: Response }).context?.json())?.error ?? ''
      } catch {
        // no readable reply
      }
      setBusy(false)
      return setError(
        code === 'same_password' ? w.sameAsTemporary : code === 'too_short' ? w.tooShort : wording.general.offline,
      )
    }
    // Saving a new password ends every existing session, so sign straight
    // back in with it. The new session no longer carries the flag.
    if (data?.ok) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session.user.email ?? '',
        password,
      })
      if (signInError) await supabase.auth.signOut({ scope: 'local' })
    }
    setBusy(false)
  }

  return (
    <main className="page">
      <h1 className="large-title">{wording.appName}</h1>
      <form className="card form" onSubmit={onSubmit} noValidate>
        <h2 className="card-headline">{w.title}</h2>
        <p className="body">{w.intro}</p>
        {/* Lets iCloud Keychain save the new password against this email. */}
        <input className="visually-hidden" name="username" type="email" autoComplete="username" value={session.user.email ?? ''} readOnly tabIndex={-1} aria-hidden="true" />
        <label className="field">
          <span>{w.newPassword}</span>
          <input name="new-password" type="password" autoComplete="new-password" minLength={12} required />
        </label>
        <label className="field">
          <span>{w.confirm}</span>
          <input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? w.working : w.submit}
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </main>
  )
}
