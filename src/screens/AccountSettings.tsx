import { type FormEvent, useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import { ChevronRightIcon } from '../components/Icons'
import { callFunction } from '../lib/functions'
import { checkNewPassword } from '../lib/password'
import { forgetThisDevice } from '../lib/push'
import { supabase } from '../lib/supabase'

const w = wording.settings

type Panel = 'password' | 'everywhere' | 'delete' | null

// The account part of Settings: change password (R4), sign out everywhere
// (R7) and delete my data (R8, R59). Each opens in place of the list.
export default function AccountSettings({ email }: { email: string }) {
  const [panel, setPanel] = useState<Panel>(null)
  const [done, setDone] = useState<string | null>(null)

  const close = (message: string | null = null) => {
    setPanel(null)
    setDone(message)
  }

  if (panel === 'password') return <ChangePassword email={email} onDone={() => close(w.passwordChanged)} onCancel={() => close()} />
  if (panel === 'everywhere') return <SignOutEverywhere onCancel={() => close()} />
  if (panel === 'delete') return <DeleteData onDone={() => close(w.deleted)} onCancel={() => close()} />

  return (
    <section className="card account" aria-labelledby="account-h">
      <h2 id="account-h" className="card-headline">
        {w.account}
      </h2>
      {done && (
        <p className="body" role="status">
          {done}
        </p>
      )}
      <div className="settings-list">
        <button className="settings-row" type="button" onClick={() => setPanel('password')}>
          <span>{w.changePassword}</span>
          <ChevronRightIcon className="chevron" />
        </button>
        <button className="settings-row" type="button" onClick={() => setPanel('everywhere')}>
          <span>{w.signOutEverywhere}</span>
          <ChevronRightIcon className="chevron" />
        </button>
        <button className="settings-row danger" type="button" onClick={() => setPanel('delete')}>
          <span>{w.deleteData}</span>
          <ChevronRightIcon className="chevron" />
        </button>
      </div>
    </section>
  )
}

function ChangePassword({ email, onDone, onCancel }: { email: string; onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const current = String(form.get('current') ?? '')
    const password = String(form.get('password') ?? '')
    const problem = checkNewPassword(password, String(form.get('confirm') ?? ''))
    if (problem) return setError(problem)
    if (password === current) return setError(w.samePassword)
    setBusy(true)
    setError(null)
    const result = await callFunction('account-change-password', { current, password })
    if (!result.ok) {
      setBusy(false)
      const messages: Record<string, string> = {
        wrong_password: w.wrongCurrent,
        same_password: w.samePassword,
        too_short: wording.setPassword.tooShort,
        too_long: wording.setPassword.tooLong,
      }
      return setError(messages[result.code] ?? wording.general.offline)
    }
    // Saving a password ends every session; sign this phone straight back in.
    const { error: again } = await supabase.auth.signInWithPassword({ email, password })
    if (again) await supabase.auth.signOut({ scope: 'local' })
    setBusy(false)
    onDone()
  }

  return (
    <form className="card form" onSubmit={onSubmit} noValidate aria-labelledby="password-h">
      <h2 id="password-h" className="card-headline">
        {w.changePassword}
      </h2>
      <label className="field">
        <span>{w.currentPassword}</span>
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label className="field">
        <span>{w.newPassword}</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={12} />
      </label>
      <label className="field">
        <span>{w.confirmPassword}</span>
        <input name="confirm" type="password" autoComplete="new-password" required />
      </label>
      <button className="primary" type="submit" disabled={busy}>
        {busy ? w.saving : w.save}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="text-button" type="button" onClick={onCancel}>
        {w.cancel}
      </button>
    </form>
  )
}

function SignOutEverywhere({ onCancel }: { onCancel: () => void }) {
  const [busy, setBusy] = useState(false)

  async function signOutEverywhere() {
    setBusy(true)
    try {
      await forgetThisDevice()
    } catch {
      // Sign out anyway; the phone may already have no subscription.
    }
    // Ends every session for this account, on every device (R7).
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) await supabase.auth.signOut({ scope: 'local' })
  }

  return (
    <section className="card" aria-labelledby="everywhere-h">
      <h2 id="everywhere-h" className="card-headline">
        {w.signOutEverywhere}
      </h2>
      <p className="body">{w.signOutEverywhereNote}</p>
      <button className="primary" type="button" onClick={signOutEverywhere} disabled={busy}>
        {busy ? w.signingOut : w.signOutEverywhere}
      </button>
      <button className="text-button" type="button" onClick={onCancel} disabled={busy}>
        {w.cancel}
      </button>
    </section>
  )
}

// Asks for the password, then deletes (R8, R59). The red button is the
// confirmation step; nothing is deleted before it.
function DeleteData({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = String(new FormData(e.currentTarget).get('password') ?? '')
    setBusy(true)
    setError(null)
    const result = await callFunction('account-delete-data', { password })
    setBusy(false)
    if (!result.ok) return setError(result.code === 'wrong_password' ? w.wrongPassword : wording.general.offline)
    onDone()
  }

  return (
    <form className="card form" onSubmit={onSubmit} noValidate aria-labelledby="delete-h">
      <h2 id="delete-h" className="card-headline">
        {w.deleteData}
      </h2>
      <p className="body">{w.deleteNote}</p>
      <p className="body">{w.passwordPrompt}</p>
      <label className="field">
        <span>{w.password}</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="primary destructive" type="submit" disabled={busy}>
        {busy ? w.deleting : w.deleteData}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="text-button" type="button" onClick={onCancel} disabled={busy}>
        {w.cancel}
      </button>
    </form>
  )
}
