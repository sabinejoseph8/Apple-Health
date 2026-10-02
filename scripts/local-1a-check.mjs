// Local end-to-end check for Phase 1a. Run with: npm run check:local
// Needs the local copy of Supabase (npm run db:start) and the functions
// running (npx supabase functions serve --env-file supabase/functions/.env).
// Uses only made-up accounts, then deletes them. Decrypts the pushed message
// with a fake device's keys to prove the server function's encryption.
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import http from 'node:http'
import { execSync } from 'node:child_process'

const st = Object.fromEntries(execSync('npx supabase status -o env')
  .toString().split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const URL_ = st.API_URL, PUB = st.PUBLISHABLE_KEY, SECRET = st.SECRET_KEY, DB = st.DB_URL
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } })
const email = `local-${Date.now()}@example.test`, temp = 'temporary-pass-123'
const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password: temp, email_confirm: true, app_metadata: { must_change_password: true } })
ok(!ce, 'owner-style account created with the change-password flag')

const app = createClient(URL_, PUB, { auth: { persistSession: false } })
const { data: s1 } = await app.auth.signInWithPassword({ email, password: temp })
ok(s1.session?.user.app_metadata.must_change_password === true, 'first sign-in carries the change-password flag')
const { error: wrong } = await app.auth.signInWithPassword({ email, password: 'not-the-password' })
ok(wrong?.status === 400, 'a wrong password is refused')
await app.auth.signInWithPassword({ email, password: temp })

const call = async (name, body) => {
  const { data: { session } } = await app.auth.getSession()
  const r = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const blocked = await call('send-push', { kind: 'test' })
ok(blocked.status === 403, 'notifications are refused until the password is changed')
const short = await call('account-first-login', { password: 'short' })
ok(short.status === 400 && short.body.error === 'too_short', 'a short new password is refused by the server')
const same = await call('account-first-login', { password: temp })
ok(same.status === 400 && same.body.error === 'same_password', 'reusing the temporary password is refused')
const good = await call('account-first-login', { password: 'my-own-new-password-42' })
ok(good.status === 200, 'a new 12+ character password is saved')
const { error: stale } = await app.auth.refreshSession()
ok(!!stale, 'saving the new password ends the old session')
const { data: s2 } = await app.auth.signInWithPassword({ email, password: 'my-own-new-password-42' })
ok(s2.session?.user.app_metadata.must_change_password === false, 'signing in with the new password gives a session without the flag')
const again = await call('account-first-login', { password: 'another-password-999' })
ok(again.status === 409, 'the first-login function cannot be used again')
const { error: oldPw } = await createClient(URL_, PUB, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password: temp })
ok(!!oldPw, 'the temporary password no longer works')

// A fake device: its own P-256 key pair and auth secret, like a browser makes.
const ua = crypto.createECDH('prime256v1'); ua.generateKeys()
const authSecret = crypto.randomBytes(16)
const received = []
const server = http.createServer((req, res) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { received.push({ headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(201); res.end() }) })
await new Promise((r) => server.listen(8787, '0.0.0.0', r))
const endpoint = `http://host.docker.internal:8787/push/${crypto.randomUUID()}`
execSync(`docker exec supabase_db_clarivi psql -U postgres -qc "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('${created.user.id}', '${endpoint}', '${ua.getPublicKey().toString('base64url')}', '${authSecret.toString('base64url')}')"`)

const sent = await call('send-push', { kind: 'test', delay_seconds: 1 })
ok(sent.status === 202 && sent.body.devices === 1, 'the test notification is accepted for 1 device')
for (let i = 0; i < 40 && received.length === 0; i++) await new Promise((r) => setTimeout(r, 250))
ok(received.length === 1, 'the push service received exactly one message')
const msg = received[0]
ok(msg?.headers['content-encoding'] === 'aes128gcm' && /^vapid t=/.test(msg?.headers.authorization ?? ''), 'it is encrypted and signed as web push requires')

// Decrypt (RFC 8291 / RFC 8188) with the fake device's keys.
const body = msg.body
const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), cipher = body.subarray(21 + idlen)
const shared = ua.computeSecret(asPub)
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len))
const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32)
const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)
const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(cipher.subarray(cipher.length - 16))
const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()])
const text = plain.subarray(0, plain.lastIndexOf(2)).toString()
const payload = JSON.parse(text)
ok(payload.title === 'Clarivi' && payload.body === 'Test notification. Tap to open Clarivi.' && payload.url === '/', `the device can decrypt it: ${text}`)

// A second account sees nothing of the first.
const other = `local-other-${Date.now()}@example.test`
await admin.auth.admin.createUser({ email: other, password: 'other-account-pass-1', email_confirm: true })
const app2 = createClient(URL_, PUB, { auth: { persistSession: false } })
await app2.auth.signInWithPassword({ email: other, password: 'other-account-pass-1' })
const { data: subs2 } = await app2.from('push_subscriptions').select('*')
const { data: prof2 } = await app2.from('profiles').select('user_id')
ok(subs2.length === 0 && prof2.length === 1 && prof2[0].user_id !== created.user.id, 'the second account sees only its own profile and none of the first account\'s devices')

server.close()
await admin.auth.admin.deleteUser(created.user.id); const { data: list } = await admin.auth.admin.listUsers(); for (const u of list.users) if (u.email === other) await admin.auth.admin.deleteUser(u.id)
