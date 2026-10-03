import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { wording } from '../../supabase/functions/_shared/wording'
import { supabase } from '../lib/supabase'
import UploadToken from './UploadToken'
import { currentPushSupport, refreshSubscription, sendTestNotification, turnOnNotifications } from '../lib/push'

const w = wording.notifications
const TEST_DELAY_SECONDS = 15

export default function Home({ session }: { session: Session }) {
  const [isOwner, setIsOwner] = useState(false)
  const [devices, setDevices] = useState<number | null>(null)
  const [support, setSupport] = useState(currentPushSupport)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadAccount() {
    // Row-level security means these only ever return this user's rows.
    const [{ data: profile }, { count }] = await Promise.all([
      supabase.from('profiles').select('is_owner').maybeSingle(),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).is('revoked_at', null),
    ])
    setIsOwner(profile?.is_owner === true)
    setDevices(count ?? 0)
  }

  useEffect(() => {
    refreshSubscription()
      .then(setSubscribed)
      .catch(() => setSubscribed(false))
      .finally(loadAccount)
  }, [])

  async function onTurnOn() {
    setBusy(true)
    setMessage(null)
    try {
      await turnOnNotifications()
      setSubscribed(true)
    } catch {
      setSupport(currentPushSupport())
      setMessage(w.failed)
    }
    await loadAccount()
    setBusy(false)
  }

  async function onTest() {
    setBusy(true)
    setMessage(null)
    try {
      await sendTestNotification(TEST_DELAY_SECONDS)
      setMessage(w.testScheduled)
    } catch {
      setMessage(w.failed)
    }
    setBusy(false)
  }

  return (
    <main className="page">
      <h1 className="large-title">{wording.appName}</h1>

      <section className="card">
        <p className="caption">{wording.home.signedInAs}</p>
        <p className="emphasis">{session.user.email}</p>
        {isOwner && <span className="pill">{wording.home.owner}</span>}
      </section>

      <section className="card" aria-labelledby="notif-h">
        <h2 id="notif-h" className="card-headline">{w.title}</h2>
        {support === 'not-installed' && <p className="body">{w.notInstalled}</p>}
        {support === 'not-supported' && <p className="body">{w.notSupported}</p>}
        {support === 'blocked' && <p className="body">{w.blocked}</p>}
        {support === 'ready' && !subscribed && (
          <button className="primary" type="button" onClick={onTurnOn} disabled={busy}>
            {busy ? w.turningOn : w.turnOn}
          </button>
        )}
        {support === 'ready' && subscribed && (
          <>
            <p className="body">{w.on}</p>
            <button className="primary" type="button" onClick={onTest} disabled={busy}>
              {w.sendTest}
            </button>
          </>
        )}
        {devices !== null && <p className="caption">{w.devices(devices)}</p>}
        {message && <p className="body" role="status">{message}</p>}
      </section>

      <UploadToken />

      <button className="text-button" type="button" onClick={() => supabase.auth.signOut({ scope: 'local' })}>
        {wording.home.signOut}
      </button>
    </main>
  )
}
