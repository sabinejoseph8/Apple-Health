// Local end-to-end check for Phase 1b. Run with: npm run check:local:sync
// Needs the local copy of Supabase (npm run db:start) and the functions
// running (npx supabase functions serve --env-file supabase/functions/.env).
// Uses only made-up accounts and readings, then deletes them. Posts to the
// ingest function the way the Shortcut does: an upload token and nothing else.
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

const st = Object.fromEntries(execSync('npx supabase status -o env')
  .toString().split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const URL_ = st.API_URL, PUB = st.PUBLISHABLE_KEY, SECRET = st.SECRET_KEY
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } })
const password = 'local-sync-check-pass-1'
async function account(label) {
  const email = `local-${label}-${Date.now()}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const app = createClient(URL_, PUB, { auth: { persistSession: false } })
  await app.auth.signInWithPassword({ email, password })
  return { id: data.user.id, app }
}
const a = await account('a')
const b = await account('b')

const call = async (app, name, body) => {
  const { data: { session } } = await app.auth.getSession()
  const r = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
// Exactly what the Shortcut sends: the upload token, no API key, no session.
const ingest = async (token, body) => {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${URL_}/functions/v1/ingest`, { method: 'POST', headers, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => null) }
}

// A phone time zone that makes local time 8am now, so "last night" is the same whenever this runs.
const now = new Date()
const off = ((480 - (now.getUTCHours() * 60 + now.getUTCMinutes())) + 2160) % 1440 - 720
const pad = (n) => String(Math.abs(n)).padStart(2, '0')
const iso = (minutesAgo) => {
  const local = new Date(now.getTime() - minutesAgo * 60_000 + off * 60_000)
  return `${local.toISOString().slice(0, 19)}${off < 0 ? '-' : '+'}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
}
const reading = (type, minutesAgo, value, unit) => ({ type, start: iso(minutesAgo), end: iso(minutesAgo), value, unit, source: 'Test Watch' })
const sleep = (stage, fromAgo, toAgo) => ({ type: 'sleep_stage', start: iso(fromAgo), end: iso(toAgo), stage, source: 'Test Watch' })
const night = [
  reading('heart_rate', 200, 54, 'count/min'),
  reading('heart_rate', 140, 51, 'count/min'),
  reading('hrv_sdnn', 150, 48, 'ms'),
  reading('respiratory_rate', 150, 14.5, 'count/min'),
  reading('resting_hr', 900, 58, 'count/min'),
  sleep('Core', 480, 120),
  sleep('REM', 120, 60),
  sleep('Awake', 60, 55),
]
const daily = (samples) => ({ schema_version: 1, kind: 'daily', device_tz_offset_min: off, trigger: 'charger', samples })
const ping = { schema_version: 1, kind: 'ping', device_tz_offset_min: off, trigger: 'charger' }

// Token creation.
const wrong = await call(a.app, 'account-token', { password: 'not-my-password-at-all' })
ok(wrong.status === 401 && wrong.body?.error === 'wrong_password', 'a token is refused with the wrong password')
const first = await call(a.app, 'account-token', { password })
const token1 = first.body?.token
ok(first.status === 200 && /^clv_[A-Za-z0-9_-]{43}$/.test(token1 ?? ''), 'the right password creates a token, shown once')
const { data: tokenRows } = await a.app.from('upload_tokens').select('created_at, last_used_at').is('revoked_at', null)
ok(tokenRows?.length === 1 && tokenRows[0].last_used_at === null, 'the app sees one unused token')
const { error: hashRead } = await a.app.from('upload_tokens').select('token_hash')
ok(!!hashRead, 'the app cannot read the token hash')

// The morning sync.
const p1 = await ingest(token1, ping)
ok(p1.status === 200 && p1.body.already_complete_today === false, 'the first ping says not synced yet')
const d1 = await ingest(token1, daily(night))
ok(d1.status === 200 && d1.body.accepted === night.length && d1.body.night_complete === true, `the morning post stores all ${night.length} readings and completes the night`)
ok(Object.keys(d1.body).sort().join() === 'accepted,already_complete_today,duplicates,message,night_complete', 'the reply holds counts, flags and a message only')
const d2 = await ingest(token1, daily(night))
ok(d2.status === 200 && d2.body.accepted === 0 && d2.body.duplicates === night.length, 'posting the same readings again stores nothing new')
const p2 = await ingest(token1, ping)
ok(p2.status === 200 && p2.body.already_complete_today === true, 'a second run stops after the ping')
const { count } = await a.app.from('samples').select('id', { count: 'exact', head: true })
ok(count === night.length, 'user A sees their readings once, with no duplicates')

// The shape the Shortcut sends: one list per column, an empty type as [""],
// and heart rate kept only from 6pm to noon by its own local time.
const atLocal = (hhmm) => {
  const day = new Date(now.getTime() + off * 60_000).toISOString().slice(0, 10)
  return `${day}T${hhmm}:00${off < 0 ? '-' : '+'}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
}
const columns = {
  schema_version: 1, kind: 'daily', device_tz_offset_min: iso(0).slice(-6), trigger: 'app',
  series: [
    { type: 'heart_rate', start: [atLocal('06:01'), atLocal('06:02')], end: [atLocal('06:01'), atLocal('06:02')], value: ['50', '49'], unit: ['count/min', 'count/min'], source: ['Test Watch', 'Test Watch'] },
    { type: 'respiratory_rate', start: [''], end: [''], value: [''], unit: [''], source: [''] },
  ],
}
const c1 = await ingest(token1, columns)
ok(c1.status === 200 && c1.body.accepted === 2, 'a post in columns, shaped like the Shortcut\'s, stores its readings')

// Rejections.
const bad = await ingest(token1, daily([night[0], { ...night[0], type: 'steps' }, { ...night[0], value: 400 }]))
ok(bad.status === 200 && bad.body.duplicates === 1, 'bad readings are set aside and the rest of the post is stored')
const { data: setAsideRow } = await a.app.from('uploads').select('set_aside_count, set_aside_note').eq('set_aside_count', 2).maybeSingle()
ok(setAsideRow?.set_aside_note?.includes('unknown type') && !setAsideRow.set_aside_note.includes('400'),
  'the upload row says why, without repeating any value')
const malformed = await ingest(token1, { ...daily(night), schema_version: 2 })
ok(malformed.status === 400 && malformed.body.detail === 'unknown schema_version', 'a malformed post is still refused with its reason')
const none = await ingest(null, ping)
ok(none.status === 401, 'a post without a token is refused')
const unknown = await ingest(`clv_${'Z'.repeat(43)}`, ping)
ok(unknown.status === 401 && unknown.body.error === 'invalid_token', 'an unknown token is refused')

// Reissuing.
const second = await call(a.app, 'account-token', { password })
const token2 = second.body?.token
ok(second.status === 200 && token2 && token2 !== token1, 'reissuing gives a new token')
const old = await ingest(token1, ping)
ok(old.status === 401 && old.body.error === 'token_revoked', 'the old token stops working at once')
const fresh = await ingest(token2, ping)
ok(fresh.status === 200 && fresh.body.already_complete_today === true, 'the new token works straight away')

// Isolation.
const { count: bCount } = await b.app.from('samples').select('id', { count: 'exact', head: true })
ok(bCount === 0, 'user B sees none of user A\'s readings')
const { count: bUploads } = await b.app.from('uploads').select('id', { count: 'exact', head: true })
ok(bUploads === 0, 'user B sees none of user A\'s uploads')

await admin.auth.admin.deleteUser(a.id)
await admin.auth.admin.deleteUser(b.id)
console.log(process.exitCode ? 'Some checks failed.' : 'All local sync checks passed.')
