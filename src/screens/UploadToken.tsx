import { type FormEvent, useEffect, useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import { ChevronRightIcon } from '../components/Icons'
import { callFunction } from '../lib/functions'
import { SHORTCUT_URL } from '../lib/links'
import { health, type HealthStatus, isNative } from '../lib/native'
import AppLink from '../components/AppLink'
import { NativeSyncButton } from '../components/NativeSync'
import { supabase } from '../lib/supabase'
import { formatWhen } from '../lib/when'

const w = wording.uploadToken
const n = wording.native

type Current = { created_at: string; last_used_at: string | null } | null

// Creates or reissues the token the iPhone Shortcut uses (R8, R10, R11).
// Asks for the password first, then shows the new token once, alongside the
// Shortcut's link and the setup guide (R10, D78). Part of Settings. Inside
// the native app (D115) the app itself sends the readings, so a new token is
// saved in the app, and an existing one can be pasted in.
export default function UploadToken() {
  // undefined while loading, null when there is no working token.
  const [current, setCurrent] = useState<Current | undefined>(undefined)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const native = isNative()
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)
  // Why the native side could not be asked, if it couldn't (never a reading).
  const [healthError, setHealthError] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)

  async function load() {
    // Row-level security means this only ever returns this user's token.
    const { data } = await supabase
      .from('upload_tokens')
      .select('created_at, last_used_at')
      .is('revoked_at', null)
      .maybeSingle()
    setCurrent(data ?? null)
    try {
      setHealthStatus(await health.status())
      setHealthError(null)
    } catch (e) {
      setHealthStatus(null)
      setHealthError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function onPaste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const pasted = String(new FormData(e.currentTarget).get('token') ?? '').trim()
    if (!pasted) return
    setBusy(true)
    setError(null)
    try {
      await health.setToken(pasted)
      setPasting(false)
    } catch {
      setError(wording.general.offline)
    }
    setBusy(false)
    await load()
  }

  async function onRemove() {
    await health.clearToken()
    await load()
  }

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
    // The native app keeps the new token itself (D115); it's still shown
    // once, for a Shortcut that should keep working beside it.
    if (native) await health.setToken(result.data.token).catch(() => setError(wording.general.offline))
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
      <p className="body">{native ? n.tokenIntro : w.intro}</p>
      {native && healthError && <p className="form-error" role="alert">{n.healthUnavailable(healthError)}</p>}

      {native && healthStatus && !token && (
        <>
          <p className="caption" role="status">{healthStatus.hasToken ? n.tokenSaved : n.tokenMissing}</p>
          {healthStatus.lastRun && (
            <p className="caption">{n.lastRun(formatWhen(healthStatus.lastRun.at), healthStatus.lastRun.message)}</p>
          )}
          {/* A sync by hand at any hour, like running the Shortcut by hand (D115). */}
          {healthStatus.hasToken && <NativeSyncButton onDone={load} />}
          {healthStatus.hasToken && (
            <button className="text-button" type="button" onClick={onRemove} disabled={busy}>
              {n.tokenRemove}
            </button>
          )}
          {!healthStatus.hasToken && !pasting && !asking && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setError(null)
                setPasting(true)
              }}
            >
              {n.tokenPaste}
            </button>
          )}
          {pasting && (
            <form className="form" onSubmit={onPaste} noValidate>
              <label className="field">
                {n.tokenField}
                <input name="token" type="text" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} required autoFocus />
              </label>
              <button className="primary" type="submit" disabled={busy}>
                {n.tokenSave}
              </button>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="text-button" type="button" onClick={() => setPasting(false)}>
                {w.cancel}
              </button>
            </form>
          )}
        </>
      )}

      {token && (
        <>
          <p className="body" role="status">{native ? n.tokenCreatedSaved : w.showOnce}</p>
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

      {!token && !asking && !pasting && (
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

      {/* The native app syncs Health itself (D115), so it has no Shortcut to get. */}
      {!isNative() && (
        <a className="link-row" href={SHORTCUT_URL} target="_blank" rel="noopener noreferrer">
          <span>{w.getShortcut}</span>
          <ChevronRightIcon className="chevron" />
        </a>
      )}
      {/* Not while a new token is on screen: it's shown only once, and leaving
          Settings for the guide would lose it. */}
      {!token && (
        <AppLink className="link-row" to="guide">
          <span>{w.guide}</span>
          <ChevronRightIcon className="chevron" />
        </AppLink>
      )}
    </section>
  )
}
