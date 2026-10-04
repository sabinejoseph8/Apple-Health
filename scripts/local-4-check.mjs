// Local end-to-end check for Phase 4's sender. Run with: npm run check:local:notify
// Needs the local copy of Supabase (npm run db:start) and the functions
// running with the local settings, which hold local test push keys:
// npx supabase functions serve --env-file supabase/functions/.env
// A made-up account with a fake phone gets a morning status; the database's
// every-minute call (send_due_notifications, through pg_net) must reach the
// sender, which must deliver one encrypted message the phone can read.
// Uses only made-up data, and deletes it at the end.
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import http from 'node:http'
import { execSync } from 'node:child_process'

const st = Object.fromEntries(execSync('npx supabase status -o env')
  .toString().split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(st.API_URL)) throw new Error('local copy only')
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const sql = (q) => execSync(`docker exec -i supabase_db_clarivi psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim()
const admin = createClient(st.API_URL, st.SECRET_KEY, { auth: { persistSession: false } })
// Clear anything an interrupted earlier run left behind.
sql(`delete from auth.users where email like 'notify-%@example.test';`)

// The migration made the cron key in the local Vault (D66); the database
// reaches the local functions through the gateway's address inside Docker.
ok(sql(`select count(*) from vault.secrets where name = 'clarivi_cron_key'`) === '1', 'the database made its own cron key')
sql(`delete from vault.secrets where name = 'clarivi_functions_url';
     select vault.create_secret('http://supabase_kong_clarivi:8000/functions/v1', 'clarivi_functions_url');`)

// A made-up person whose local time is 7:00am now, so the morning rules apply.
const now = new Date()
const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes()
let offset = 7 * 60 - utcMin
if (offset > 840) offset -= 1440
if (offset < -720) offset += 1440
const local = new Date(now.getTime() + offset * 60000)
const today = local.toISOString().slice(0, 10)
const { data: made } = await admin.auth.admin.createUser({ email: `notify-${Date.now()}@example.test`, password: 'local-notify-check-1', email_confirm: true })
const uid = made.user.id
sql(`update public.profiles set latest_tz_offset_min = ${offset} where user_id = '${uid}';`)

// A fake phone: its own P-256 key pair and auth secret, like a browser makes.
const ua = crypto.createECDH('prime256v1'); ua.generateKeys()
const authSecret = crypto.randomBytes(16)
const received = []
const server = http.createServer((req, res) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { received.push({ headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(201); res.end() }) })
await new Promise((r) => server.listen(8788, '0.0.0.0', r))
sql(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('${uid}', 'http://host.docker.internal:8788/push/${crypto.randomUUID()}', '${ua.getPublicKey().toString('base64url')}', '${authSecret.toString('base64url')}');`)

// This morning: a sync that completed the night, and an Ease off status.
const points = JSON.stringify({
  hrv: { value: 38, normal: 52, range_low: 40, range_high: 64, verdict: 'below', spreads_worse: 2.33, counted: true, points: 0.93 },
  sleep: { value: 352, normal: 430, range_low: 362, range_high: 498, verdict: 'below', spreads_worse: 2.29, counted: true, points: 0.57 },
  sleeping_hr: { value: 51, normal: 50, range_low: 45, range_high: 55, verdict: 'in_range', spreads_worse: 0.4, counted: true, points: 0.14 },
})
sql(`insert into public.uploads (user_id, received_at, schema_version, kind, device_tz_offset_min, local_date, night_complete, status)
     values ('${uid}', now() - interval '5 minutes', 1, 'daily', ${offset}, '${today}', true, 'accepted');
     insert into public.daily_status (user_id, date, status, readings_used, points, total, nudge, reason_codes, composite_fired, settings_version)
     values ('${uid}', '${today}', 'ease_off', 3, '${points}', 1.64, 'train_easy',
             array['hrv_outside_range', 'sleep_outside_range', 'sleeping_hr_worse_than_normal'], false, 2);`)
ok(sql(`select public.queue_morning_notification('${uid}')`) === 't', 'the morning notification is queued after the analysis')
ok(sql(`select public.queue_morning_notification('${uid}')`) === 'f', 'and only once')

// A wrong key is refused.
const wrong = await fetch(`${st.API_URL}/functions/v1/send-push`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-clarivi-cron': 'not-the-key' }, body: '{"kind":"due"}' })
ok(wrong.status === 401, 'the sender refuses a call without the cron key')

// The database's every-minute call reaches the sender through pg_net.
ok(sql('select public.send_due_notifications() is not null') === 't', 'the every-minute job calls the sender when something is due')
for (let i = 0; i < 60 && received.length === 0; i++) await new Promise((r) => setTimeout(r, 250))
ok(received.length === 1, 'the fake phone received exactly one message')
const msg = received[0]
ok(msg?.headers['content-encoding'] === 'aes128gcm' && /^vapid t=/.test(msg?.headers.authorization ?? ''), 'it is encrypted and signed as web push requires')

// Decrypt (RFC 8291 / RFC 8188) with the fake phone's keys.
const body = msg.body
const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), cipher = body.subarray(21 + idlen)
const shared = ua.computeSecret(asPub)
const hkdf = (s, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, len))
const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32)
const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)
const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(cipher.subarray(cipher.length - 16))
const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()])
const payload = JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString())
const id = sql(`select id from public.notifications where user_id = '${uid}' and kind = 'morning'`)
ok(payload.title === 'Clarivi' && payload.body === 'Ease off today: HRV well below your usual, sleep short' && payload.url === `/?n=${id}&k=morning`,
  `the phone can read it: ${payload.body}`)

for (let i = 0; i < 20 && sql(`select status from public.notifications where id = ${id}`) !== 'sent'; i++) await new Promise((r) => setTimeout(r, 250))
ok(sql(`select status || ' ' || devices || ' ' || (sent_at is not null) from public.notifications where id = ${id}`) === 'sent 1 true', 'the outbox records it as sent to 1 phone')
ok(sql(`select status || ' ' || nudge from public.shown_status where user_id = '${uid}' and via = 'notification'`) === 'ease_off train_easy',
  'what the notification showed is kept (D61)')
ok(sql('select public.send_due_notifications() is null') === 't', 'with nothing left to send, the sender is not called again')

// A tap opens the app with the id, which records it (R51).
const app = createClient(st.API_URL, st.PUBLISHABLE_KEY, { auth: { persistSession: false } })
await app.auth.signInWithPassword({ email: made.user.email, password: 'local-notify-check-1' })
await app.rpc('log_notification_tap', { p_id: Number(id) })
ok(sql(`select tapped_at is not null from public.notifications where id = ${id}`) === 't', 'a tap on the notification is recorded')

server.close()
await admin.auth.admin.deleteUser(uid)
