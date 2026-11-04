import { useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import { health } from '../lib/native'

const n = wording.native

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
