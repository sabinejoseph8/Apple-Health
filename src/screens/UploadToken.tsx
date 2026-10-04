import { type FormEvent, useEffect, useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import { callFunction } from '../lib/functions'
import { supabase } from '../lib/supabase'
import { formatWhen } from '../lib/when'

const w = wording.uploadToken

type Current = { created_at: string; last_used_at: string | null } | null

// Creates or reissues the token the iPhone Shortcut uses (R8, R10, R11).
// Asks for the password first, then shows the new token once. Part of
// Settings.
export default function UploadToken() {
  // undefined while loading, null when there is no working token.
  const [current, setCurrent] = useState<Current | undefined>(undefined)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function load() {
    // Row-level security means this only ever returns this user's token.
    const { data } = await supabase
      .from('upload_tokens')
      .select('created_at, last_used_at')
      .is('revoked_at', null)
      .maybeSingle()
    setCurrent(data ?? null)
  }

  useEffect(() => {
    load()
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = String(new FormData(e.currentTarget).get('password') ?? '')
    setBusy(true)
    setError(null)
    const result = await callFunction<{ token: string }>('account-token', { password })
    setBusy(false)
    if (!result.ok) {
      setError(result.code === 'wrong_password' ? w.wrongPassword : wording.general.offline)
      return
    }
    setAsking(false)
    setCopied(false)
    setToken(result.data.token)
    await load()
  }

  async function onCopy() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
    } catch {
      // The token stays on screen, selectable, to copy by hand.
    }
  }

  function cancel() {
    setAsking(false)
    setError(null)
  }

  const action = current ? w.reissue : w.create

  return (
    <section className="card" aria-labelledby="token-h">
      <h2 id="token-h" className="card-headline">{w.title}</h2>
      <p className="body">{w.intro}</p>

      {token && (
        <>
          <p className="body" role="status">{w.showOnce}</p>
          <output className="token">{token}</output>
          <button className="primary" type="button" onClick={onCopy}>
            {copied ? w.copied : w.copy}
          </button>
          <button className="text-button" type="button" onClick={() => setToken(null)}>
            {w.done}
          </button>
        </>
      )}

      {!token && asking && (
        <form className="form" onSubmit={onSubmit} noValidate>
          <p className="body">{w.passwordPrompt}</p>
          <label className="field">
            {w.password}
            <input name="password" type="password" autoComplete="current-password" required autoFocus />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? w.working : action}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="text-button" type="button" onClick={cancel}>
            {w.cancel}
          </button>
        </form>
      )}

      {!token && !asking && (
        <>
          {current === null && <p className="caption">{w.none}</p>}
          {current && (
            <p className="caption">
              {w.created(formatWhen(current.created_at))}{' '}
              {current.last_used_at ? w.lastUsed(formatWhen(current.last_used_at)) : w.notUsed}
            </p>
          )}
          {current && <p className="caption">{w.reissueNote}</p>}
          <button className="primary" type="button" onClick={() => setAsking(true)} disabled={current === undefined}>
            {action}
          </button>
        </>
      )}
    </section>
  )
}
