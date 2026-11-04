import { useEffect, useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import { health, type NotificationStatus, notifications } from '../lib/native'

const n = wording.native

// Settings' Notifications card inside the native app (10c): asks iOS once,
// then says whether they are on; "blocked" sends the person to iOS Settings.
export function NativeNotifications() {
  const [status, setStatus] = useState<NotificationStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const w = wording.notifications

  useEffect(() => {
    notifications.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  async function turnOn() {
    setBusy(true)
    try {
      await notifications.request()
      setStatus(await notifications.status())
    } catch {
      // Stays as it was; the button can be tried again.
    }
    setBusy(false)
  }

  return (
    <>
      <p className="body">{n.notificationsIntro}</p>
      {status === 'notDetermined' && (
        <button className="primary" type="button" onClick={turnOn} disabled={busy}>
          {busy ? w.turningOn : w.turnOn}
        </button>
      )}
      {status === 'authorized' && <p className="caption">{n.notificationsOn}</p>}
      {status === 'denied' && <p className="body">{w.blocked}</p>}
    </>
  )
}

// Inside the native iPhone app (D115, 10b): the card's Sync now runs the
// app's own Health sync instead of the Shortcut, and says how it went.
export function NativeSyncButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setMessage(null)
    try {
      const r = await health.sync('health_button')
      setMessage(r?.message ?? wording.general.offline)
    } catch {
      setMessage(wording.general.offline)
    }
    setBusy(false)
    onDone()
  }

  return (
    <>
      <button className="primary" type="button" onClick={run} disabled={busy}>
        {busy ? n.syncing : wording.card.syncNow}
      </button>
      <p className="caption" role="status">
        {message ?? n.syncHint}
      </p>
    </>
  )
}

// Asks once for permission to read Health (shown until iOS has asked).
export function HealthPermissionCard({ onAsked }: { onAsked: () => void }) {
  const [busy, setBusy] = useState(false)

  async function allow() {
    setBusy(true)
    try {
      await health.requestPermission()
    } catch {
      // The sheet may not have shown; the card stays until it has.
    }
    setBusy(false)
    onAsked()
  }

  return (
    <section className="card" aria-labelledby="health-h">
      <h2 id="health-h" className="card-headline">
        {n.healthTitle}
      </h2>
      <p className="body">{n.healthIntro}</p>
      <button className="primary" type="button" onClick={allow} disabled={busy}>
        {n.healthAllow}
      </button>
    </section>
  )
}
