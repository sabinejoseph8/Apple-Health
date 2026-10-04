import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { wording } from '../../supabase/functions/_shared/wording'
import { supabase } from '../lib/supabase'
import { formatWhen } from '../lib/when'
import { ChevronRightIcon } from '../components/Icons'
import NavBar from '../components/NavBar'
import { go } from '../lib/route'
import AccountSettings from './AccountSettings'
import UploadToken from './UploadToken'
import { currentPushSupport, forgetThisDevice, refreshSubscription, sendTestNotification, turnOnNotifications } from '../lib/push'

const w = wording.notifications
const TEST_DELAY_SECONDS = 15

// Settings (design.md, Settings list): who is signed in, notifications
// (R47), the upload token (R10, R11), the account (R4, R7, R59) and sign
// out. The setup guide link arrives with the guide in Phase 6 (D73).
export default function Settings({ session }: { session: Session }) {
  const [isOwner, setIsOwner] = useState(false)
  const [devices, setDevices] = useState<number | null>(null)
  // When the last notification was delivered, or null for none yet (R47).
  const [lastDelivered, setLastDelivered] = useState<string | null | undefined>(undefined)
  const [support, setSupport] = useState(currentPushSupport)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadAccount() {
    // Row-level security means these only ever return this user's rows.
    const [{ data: profile }, { count }, { data: last }] = await Promise.all([
      supabase.from('profiles').select('is_owner').maybeSingle(),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).is('revoked_at', null),
      supabase.from('notifications').select('sent_at').eq('status', 'sent').order('sent_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    setIsOwner(profile?.is_owner === true)
    setDevices(count ?? 0)
    setLastDelivered((last as { sent_at: string } | null)?.sent_at ?? null)
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

  async function signOut() {
    try {
      await forgetThisDevice()
    } catch {
      // Sign out anyway; the phone may already have no subscription.
    }
    await supabase.auth.signOut({ scope: 'local' })
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
      <NavBar title={wording.day.settings} />

      <section className="card">
        <p className="caption">{wording.home.signedInAs}</p>
        <p className="emphasis">{session.user.email}</p>
        {isOwner && <span className="pill">{wording.home.owner}</span>}
        {isOwner && (
          <a
            className="link-row"
            href="#/owner"
            onClick={(e) => {
              e.preventDefault()
              go('owner')
            }}
          >
            <span>{wording.owner.link}</span>
            <ChevronRightIcon className="chevron" />
          </a>
        )}
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
        {lastDelivered !== undefined && (
          <p className="caption">{lastDelivered ? w.lastDelivered(formatWhen(lastDelivered)) : w.noneDelivered}</p>
        )}
        {message && <p className="body" role="status">{message}</p>}
      </section>

      <UploadToken />

      <AccountSettings email={session.user.email ?? ''} />

      <button className="text-button" type="button" onClick={signOut}>
        {wording.settings.signOut}
      </button>
    </main>
  )
}
