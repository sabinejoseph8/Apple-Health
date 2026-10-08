import { useState, type FormEvent } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import AppLink from '../components/AppLink'
import { supabase } from '../lib/supabase'

const w = wording.signIn

export default function SignIn() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
    })
    setBusy(false)
    if (error) setError(error.status && error.status < 500 ? w.wrongDetails : wording.general.offline)
  }

  return (
    <main className="page">
      <h1 className="large-title">{wording.appName}</h1>
      <form className="card form" onSubmit={onSubmit} noValidate>
        <h2 className="card-headline">{w.title}</h2>
        <label className="field">
          <span>{w.email}</span>
          <input name="email" type="email" autoComplete="username" autoCapitalize="none" inputMode="email" required />
        </label>
        <label className="field">
          <span>{w.password}</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? w.working : w.submit}
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
      <p className="footnote">{w.forgot}</p>
      <AppLink className="text-link center" to="guide">
        {w.guide}
      </AppLink>
    </main>
  )
}
