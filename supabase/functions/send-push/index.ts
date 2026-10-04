// Sends notifications through Apple's web push service.
// - {"kind": "test"}: a test notification to the signed-in user's own
//   devices, after an optional short delay (Phase 1a push spike).
// - {"kind": "due"}: the outbox's due notifications (Phase 4), called every
//   minute by the database with the cron key in "x-clarivi-cron", which the
//   database checks; the key lives only in Vault (D66).
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import { adminClient, corsHeaders, json, mustChangePassword, userFromRequest } from '../_shared/http.ts'
import { wording } from '../_shared/wording.ts'
import { type DayStatus, type Device, type Message, type OutboxRow, type SendResult, sendDue } from './outbox.ts'

const MAX_DELAY_SECONDS = 30

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function bytesToB64url(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// The keys are stored as the public key (65 raw bytes) and the private key
// (32 raw bytes), both base64url. The library wants them as JWKs.
async function vapidKeys(): Promise<CryptoKeyPair> {
  const pub = b64urlToBytes(Deno.env.get('VAPID_PUBLIC_KEY') ?? '')
  const d = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  if (pub.length !== 65 || !d) throw new Error('VAPID keys are not set')
  const x = bytesToB64url(pub.slice(1, 33))
  const y = bytesToB64url(pub.slice(33, 65))
  return await webpush.importVapidKeys({
    publicKey: { kty: 'EC', crv: 'P-256', x, y, ext: true },
    privateKey: { kty: 'EC', crv: 'P-256', x, y, d, ext: false },
  })
}

// One device, one message. Never logs the message itself.
async function pushSender(): Promise<(device: Device, message: Message) => Promise<SendResult>> {
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:clarivi@example.invalid',
    vapidKeys: await vapidKeys(),
  })
  return async (device, message) => {
    const host = new URL(device.endpoint).host
    try {
      await appServer
        .subscribe({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } })
        .pushTextMessage(JSON.stringify(message), { urgency: webpush.Urgency.High, ttl: 3600 })
      console.log(`send-push: delivered to push service ${host}`)
      return { ok: true }
    } catch (err) {
      if (err instanceof webpush.PushMessageError) {
        const status = err.response.status
        console.error(`send-push: push service ${host} refused it: ${status}`)
        return { ok: false, gone: status === 404 || status === 410, error: `push_${status}` }
      }
      console.error(`send-push: sending to ${host} failed`, err)
      return { ok: false, gone: false, error: 'push_unreachable' }
    }
  }
}

async function retire(deviceId: string) {
  await adminClient().from('push_subscriptions').update({ revoked_at: new Date().toISOString() }).eq('id', deviceId)
}

async function activeDevices(userId: string): Promise<Device[]> {
  const { data, error } = await adminClient()
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .is('revoked_at', null)
  if (error) throw new Error('device lookup failed')
  return data ?? []
}

async function sendTest(devices: Device[], delaySeconds: number) {
  await new Promise((r) => setTimeout(r, delaySeconds * 1000))
  const send = await pushSender()
  for (const device of devices) {
    const result = await send(device, { title: wording.push.testTitle, body: wording.push.testBody, url: '/' })
    if (!result.ok && result.gone) await retire(device.id)
  }
}

async function sendDueNotifications() {
  const admin = adminClient()
  const send = await pushSender()
  return await sendDue({
    async claim() {
      const { data, error } = await admin.rpc('claim_due_notifications', { p_limit: 50 })
      if (error) throw new Error('claim failed')
      return (data ?? []) as OutboxRow[]
    },
    async dayStatus(userId, date) {
      const { data, error } = await admin.from('daily_status').select('*').eq('user_id', userId).eq('date', date).maybeSingle()
      // A failed lookup is a failed send, never a day without a status.
      if (error) throw new Error('status lookup failed')
      return data as DayStatus | null
    },
    devices: activeDevices,
    send,
    retire,
    async recordShown(row, day) {
      if (day.status === 'none' || !day.nudge) return
      await admin.from('shown_status').upsert(
        {
          user_id: row.user_id,
          date: row.date,
          via: 'notification',
          status: day.status,
          nudge: day.nudge,
          reason_codes: day.reason_codes,
          readings_used: day.readings_used,
          total: day.total,
          settings_version: day.settings_version,
        },
        { onConflict: 'user_id,date,via', ignoreDuplicates: true },
      )
    },
    async finish(id, result) {
      await admin
        .from('notifications')
        .update({
          status: result.status,
          devices: result.devices ?? null,
          error: result.error ?? null,
          sent_at: result.status === 'sent' ? new Date().toISOString() : null,
        })
        .eq('id', id)
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { kind?: string; delay_seconds?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  // The every-minute call from the database (D66).
  if (body.kind === 'due') {
    const { data: allowed } = await adminClient().rpc('cron_key_ok', { p_key: req.headers.get('x-clarivi-cron') ?? '' })
    if (allowed !== true) return json({ error: 'not_allowed' }, 401)
    const summary = await sendDueNotifications()
    console.log(`send-push: due sent ${summary.sent}, skipped ${summary.skipped}, failed ${summary.failed}`)
    return json(summary)
  }

  if (body.kind !== 'test') return json({ error: 'unknown_kind' }, 400)
  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user) return json({ error: 'not_signed_in' }, 401)
  if (mustChangePassword(user)) return json({ error: 'password_change_required' }, 403)
  const delay = Math.min(MAX_DELAY_SECONDS, Math.max(0, Math.round(Number(body.delay_seconds) || 0)))

  let devices: Device[]
  try {
    devices = await activeDevices(user.id)
  } catch {
    return json({ error: 'lookup_failed' }, 500)
  }
  if (devices.length === 0) return json({ error: 'no_devices' }, 409)

  const work = sendTest(devices, delay)
  // Reply straight away and keep sending in the background.
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else await work
  return json({ devices: devices.length, delay_seconds: delay }, 202)
})
