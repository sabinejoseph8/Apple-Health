// Local load test for the one-year import (Phase 1c). Run with: npm run check:local:import
// Needs the local copy of Supabase (npm run db:start) and the functions
// running (npx supabase functions serve --env-file supabase/functions/.env).
// Posts one made-up month the size of a real one (about 1,000 heart rate
// readings a day, as on Sabine's iPhone in 1b) in the Shortcut's column
// shape, then posts it again, and reports sizes and times. Uses a made-up
// account and readings, then deletes them.
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

const st = Object.fromEntries(execSync('npx supabase status -o env')
  .toString().split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const URL_ = st.API_URL, PUB = st.PUBLISHABLE_KEY, SECRET = st.SECRET_KEY
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const HR_PER_DAY = Number(process.env.HR_PER_DAY ?? 1000)

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } })
const email = `local-import-${Date.now()}@example.test`, password = 'local-import-check-pass-1'
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
const app = createClient(URL_, PUB, { auth: { persistSession: false } })
await app.auth.signInWithPassword({ email, password })
// Uploads need consent (D79).
await app.rpc('give_consent', { p_version: 2, p_use: true, p_us_storage: true })
const { data: { session } } = await app.auth.getSession()
const tokenReply = await fetch(`${URL_}/functions/v1/account-token`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
const { token } = await tokenReply.json()

// Last month, in a UTC-5 phone.
const now = new Date()
const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth()
const monthId = `${year}-${String(month).padStart(2, '0')}`
const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
const OFF = -300
const local = (ms) => new Date(ms + OFF * 60_000).toISOString().slice(0, 19) + '-05:00'
const dayStart = (d) => Date.UTC(year, month - 1, d) - OFF * 60_000

function series(type, times, value, unit, lengthMs = 0) {
  return {
    type,
    start: times.map(local),
    end: times.map((t) => local(t + lengthMs)),
    value: times.map((_, i) => String(value(i))),
    unit: times.map(() => unit),
    source: times.map(() => 'Test Watch'),
  }
}
const hr = [], hrv = [], rr = [], rhr = [], sleep = []
for (let d = 1; d <= days; d++) {
  const start = dayStart(d)
  for (let i = 0; i < HR_PER_DAY; i++) hr.push(start + Math.floor((i * 86_400_000) / HR_PER_DAY))
  for (let i = 0; i < 6; i++) hrv.push(start + i * 4 * 3_600_000 + 600_000)
  for (let i = 0; i < 35; i++) rr.push(start + 3_600_000 + i * 600_000)
  rhr.push(start + 60_000)
  for (let i = 0; i < 15; i++) sleep.push(start + 3_600_000 + i * 1_800_000)
}
const stages = ['Core', 'Deep', 'Core', 'REM', 'Awake']
const body = {
  schema_version: 1, kind: 'backfill', month_id: monthId, device_tz_offset_min: '-05:00', trigger: 'manual',
  // The whole month in one post, so it is also the month's last part.
  month_complete: true,
  series: [
    series('heart_rate', hr, (i) => 50 + (i % 30), 'count/min'),
    series('hrv_sdnn', hrv, (i) => 40 + (i % 20), 'ms', 60_000),
    series('respiratory_rate', rr, (i) => 14 + (i % 3), 'count/min'),
    series('resting_hr', rhr, () => 58, 'count/min', 86_000_000),
    { ...series('sleep_stage', sleep, () => '', '', 1_800_000), value: sleep.map((_, i) => stages[i % stages.length]), unit: [''] },
  ],
}
const text = JSON.stringify(body)
const readings = hr.length + hrv.length + rr.length + rhr.length + sleep.length
const keptHr = hr.filter((t) => { const h = new Date(t + OFF * 60_000).getUTCHours(); return h >= 18 || h < 12 }).length
console.log(`Month ${monthId}: ${readings} readings (${hr.length} heart rate), ${(text.length / 1024 / 1024).toFixed(2)} MB`)

async function send() {
  const t0 = performance.now()
  const r = await fetch(`${URL_}/functions/v1/ingest`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: text })
  const reply = await r.json().catch(() => null)
  return { status: r.status, reply, seconds: ((performance.now() - t0) / 1000).toFixed(1) }
}
const first = await send()
console.log(`First post: ${first.status} in ${first.seconds} s`, JSON.stringify(first.reply))
const expected = keptHr + hrv.length + rr.length + rhr.length + sleep.length
ok(first.status === 200 && first.reply.accepted === expected, `a month is stored (${expected} readings, heart rate kept from 6pm to noon)`)
ok(first.reply?.months_imported === 1, 'the reply counts 1 month imported')
// Phase 2a: build the month's nights and normals from what was stored.
const t0 = performance.now()
const lastDay = `${monthId}-${String(days).padStart(2, '0')}`
const { data: rebuilt, error: rebuildError } = await admin.rpc('recompute', { p_user: created.user.id, p_from: `${monthId}-01`, p_to: lastDay })
const rebuildSeconds = ((performance.now() - t0) / 1000).toFixed(1)
console.log(`Recompute: ${JSON.stringify(rebuilt ?? rebuildError?.message)} in ${rebuildSeconds} s`)
ok(!rebuildError && rebuilt.nights === days, `every night of the month is built (${days} nights)`)
const { count: withHeartRate } = await admin.from('nights').select('night_date', { count: 'exact', head: true })
  .eq('user_id', created.user.id).not('sleeping_hr', 'is', null)
ok(withHeartRate === days, 'every night has a sleeping heart rate')
ok(Number(rebuildSeconds) < 10, 'a month recomputes in under 10 seconds')

const again = await send()
console.log(`Same month again: ${again.status} in ${again.seconds} s`)
ok(again.status === 200 && again.reply.accepted === 0 && again.reply.duplicates === expected, 'sending the month again stores nothing new')

await admin.auth.admin.deleteUser(created.user.id)
console.log(process.exitCode ? 'Some checks failed.' : 'Local import load check passed.')
