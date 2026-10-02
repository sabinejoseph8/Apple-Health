// Phase 1a push spike: sends a test notification to the signed-in user's own
// devices, after an optional short delay so the phone can be locked first.
// Phase 4 extends this function to send queued rows from the outbox.
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import { adminClient, corsHeaders, json, mustChangePassword, userFromRequest } from '../_shared/http.ts'
import { wording } from '../_shared/wording.ts'

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

type Device = { id: string; endpoint: string; p256dh: string; auth: string }

async function sendToDevices(devices: Device[], delaySeconds: number) {
  await new Promise((r) => setTimeout(r, delaySeconds * 1000))
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:clarivi@example.invalid',
    vapidKeys: await vapidKeys(),
  })
  const payload = JSON.stringify({ title: wording.push.testTitle, body: wording.push.testBody, url: '/' })
  const admin = adminClient()
  for (const device of devices) {
    const host = new URL(device.endpoint).host
    try {
      await appServer
        .subscribe({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } })
        .pushTextMessage(payload, { urgency: webpush.Urgency.High, ttl: 3600 })
      console.log(`send-push: delivered to push service ${host}`)
    } catch (err) {
      if (err instanceof webpush.PushMessageError) {
        const status = err.response.status
        console.error(`send-push: push service ${host} refused it: ${status} ${await err.response.text()}`)
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').update({ revoked_at: new Date().toISOString() }).eq('id', device.id)
        }
      } else {
        console.error(`send-push: sending to ${host} failed`, err)
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = adminClient()
  const user = await userFromRequest(req, admin)
  if (!user) return json({ error: 'not_signed_in' }, 401)
  if (mustChangePassword(user)) return json({ error: 'password_change_required' }, 403)

  let delay = 0
  try {
    const body = await req.json()
    if (body.kind !== 'test') return json({ error: 'unknown_kind' }, 400)
    delay = Math.min(MAX_DELAY_SECONDS, Math.max(0, Math.round(Number(body.delay_seconds) || 0)))
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const { data: devices, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)
    .is('revoked_at', null)
  if (error) return json({ error: 'lookup_failed' }, 500)
  if (!devices || devices.length === 0) return json({ error: 'no_devices' }, 409)

  const work = sendToDevices(devices, delay)
  // Reply straight away and keep sending in the background.
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else await work

  return json({ devices: devices.length, delay_seconds: delay }, 202)
})
