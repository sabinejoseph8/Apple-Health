// Local only: sets up a made-up account on the local copy of Supabase with
// today's card in a chosen state, to look at the screens in the dev server.
//   node scripts/local-card-demo.mjs <state>
// States: sample, ready, partial, learning, not-enough, unfinished, waiting,
// rejected. Sign in to http://localhost:5173 with the account printed below.
// Everything here is made up, and it refuses to run against anything but
// the local copy.
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

const st = Object.fromEntries(
  execSync('npx supabase status -o env')
    .toString()
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(st.API_URL)) throw new Error('local copy only')

const state = process.argv[2] ?? 'sample'
const EMAIL = 'card-demo@example.test'
const PASSWORD = 'local-card-demo-only'
const admin = createClient(st.API_URL, st.SECRET_KEY, { auth: { persistSession: false } })

// The account, made once and reused.
const { data: list } = await admin.auth.admin.listUsers()
let user = list.users.find((u) => u.email === EMAIL)
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
  if (error) throw error
  user = data.user
}
const uid = user.id

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const now = new Date()
const today = ymd(now)
const offset = -now.getTimezoneOffset()
const dayBefore = (n) => {
  const d = new Date(now)
  d.setDate(d.getDate() - n)
  return ymd(d)
}

// Start clean.
for (const table of ['daily_status', 'insights', 'baselines', 'nights', 'uploads', 'checkins', 'usage_events']) {
  const { error } = await admin.from(table).delete().eq('user_id', uid)
  if (error) throw new Error(`${table}: ${error.message}`)
}

// Made-up normals (the design's), and 42 made-up nights around them.
const NORMALS = {
  hrv: { median: 52, spread: 6 },
  sleep: { median: 430, spread: 34 },
  sleeping_hr: { median: 50, spread: 2.5 },
  resp_rate: { median: 15, spread: 0.5 },
  resting_hr: { median: 58, spread: 2 },
}
const wobble = (n, k) => Math.sin(n * 1.7 + k) * 0.9 + Math.cos(n * 0.6 + k * 2) * 0.6
const TONIGHT = {
  sample: { hrv: 38, sleep: 352, sleeping_hr: 51, resp_rate: 14.8, resting_hr: 55 },
  ready: { hrv: 54, sleep: 440, sleeping_hr: 49, resp_rate: 15, resting_hr: 57 },
  partial: { hrv: null, sleep: 352, sleeping_hr: 51, resp_rate: 14.8, resting_hr: 55 },
  learning: { hrv: 42, sleep: 370, sleeping_hr: 55, resp_rate: 15, resting_hr: 58 },
  'not-enough': { hrv: null, sleep: 300, sleeping_hr: null, resp_rate: null, resting_hr: 58 },
}
const learning = state === 'learning'
const history = learning ? 14 : 42

const nights = []
const baselines = []
for (let n = history; n >= 0; n--) {
  const date = dayBefore(n)
  const v = n === 0 && TONIGHT[state] ? TONIGHT[state] : null
  const val = (m, k) => (v ? v[m] : NORMALS[m].median + wobble(n, k) * NORMALS[m].spread)
  if (n > 0 || v) {
    const sleep = val('sleep', 2)
    nights.push({
      user_id: uid, night_date: date, tz_offset_min: offset,
      sleep_start: new Date(Date.parse(`${date}T06:30:00`) - sleep * 60000).toISOString(),
      sleep_end: new Date(`${date}T06:30:00`).toISOString(),
      asleep_min: sleep, finished: true,
      sleeping_hr: val('sleeping_hr', 3), sleeping_hr_count: 60,
      hrv_median: val('hrv', 1), hrv_count: 3,
      resp_rate: val('resp_rate', 4), resp_count: 30,
      resting_hr_prev_day: val('resting_hr', 5), coverage: 0.9, confidence: 'high',
    })
  }
  for (const [metric, b] of Object.entries(NORMALS)) {
    const valid = Math.min(42, history - n)
    const building = valid < 21
    baselines.push({
      user_id: uid, night_date: date, metric, median_28: building ? null : b.median, mad_scaled: building ? null : b.spread,
      valid_nights: valid, range_low: building ? null : b.median - 2 * b.spread, range_high: building ? null : b.median + 2 * b.spread, building,
    })
  }
}

const insert = async (table, rows) => {
  if (rows.length === 0) return
  const { error } = await admin.from(table).insert(rows)
  if (error) throw new Error(`${table}: ${error.message}`)
}
await insert('nights', nights)
await insert('baselines', baselines)

// Today's status row, worked out the way the database does it.
const W = { hrv: 0.4, sleeping_hr: 0.35, sleep: 0.25 }
const WORSE_LOW = { hrv: true, sleep: true, sleeping_hr: false }
function statusRow(values) {
  const points = {}
  const used = Object.keys(W).filter((m) => values[m] !== null)
  const wUsed = used.reduce((a, m) => a + W[m], 0)
  let total = 0
  for (const m of Object.keys(W)) {
    const b = NORMALS[m]
    if (values[m] === null) {
      points[m] = { value: null, normal: b.median, range_low: b.median - 2 * b.spread, range_high: b.median + 2 * b.spread, verdict: 'missing', spreads_worse: null, counted: false, points: null }
      continue
    }
    const value = values[m]
    const lo = b.median - 2 * b.spread
    const hi = b.median + 2 * b.spread
    const spreads = Math.max(0, (WORSE_LOW[m] ? b.median - value : value - b.median) / b.spread)
    const p = (W[m] / wUsed) * spreads
    total += p
    points[m] = { value, normal: b.median, range_low: lo, range_high: hi, verdict: value < lo ? 'below' : value > hi ? 'above' : 'in_range', spreads_worse: spreads, counted: true, points: p }
  }
  const status = total >= 2.4 ? 'rest' : total >= 1.2 ? 'ease_off' : 'ready'
  const lead = Object.keys(points).filter((m) => points[m].counted).sort((a, b) => W[b] * (points[b].spreads_worse ?? 0) - W[a] * (points[a].spreads_worse ?? 0))[0]
  const reasons = Object.keys(points)
    .filter((m) => points[m].counted && points[m].spreads_worse > 0)
    .sort((a, b) => W[b] * points[b].spreads_worse - W[a] * points[a].spreads_worse)
    .map((m) => `${m}_${points[m].verdict === 'in_range' ? 'worse_than_normal' : 'outside_range'}`)
  return {
    user_id: uid, date: today, status, no_status_reason: null, readings_used: used.length, points, total,
    nudge: status === 'ready' ? 'train_as_planned' : status === 'rest' ? 'rest' : lead === 'sleep' ? 'prioritise_sleep' : 'train_easy',
    reason_codes: reasons, composite_fired: false, composite_inputs: ['sleeping_hr', 'hrv', 'resp_rate', 'resting_hr'], settings_version: 2,
  }
}
const none = (reason, readings = 0) => ({
  user_id: uid, date: today, status: 'none', no_status_reason: reason, readings_used: readings, points: {}, total: null, nudge: null,
  reason_codes: [], composite_fired: null, composite_inputs: [], settings_version: 2,
})

const minutesAgo = (m) => new Date(now.getTime() - m * 60000).toISOString()
const upload = (extra) => ({
  user_id: uid, received_at: minutesAgo(8), schema_version: 1, kind: 'daily', run_trigger: 'charger', device_tz_offset_min: offset,
  local_date: today, sample_count: 1200, duplicate_count: 0, night_complete: true, status: 'accepted', ...extra,
})

if (['sample', 'ready', 'partial'].includes(state)) await insert('daily_status', [statusRow(TONIGHT[state])])
if (state === 'learning') await insert('daily_status', [none('learning')])
if (state === 'not-enough') await insert('daily_status', [none('not_enough_data', 1)])
if (state === 'unfinished') await insert('daily_status', [none('night_unfinished')])

if (state === 'waiting' || state === 'rejected') {
  await insert('uploads', [upload({ received_at: new Date(Date.parse(`${dayBefore(1)}T06:51:00`)).toISOString(), local_date: dayBefore(1) })])
  if (state === 'rejected') await insert('uploads', [{ user_id: uid, received_at: minutesAgo(3), status: 'rejected', error: 'token_revoked', night_complete: false }])
} else {
  await insert('uploads', [upload(state === 'unfinished' ? { night_complete: false } : {})])
}

console.log(`Local card demo ready: state "${state}" for ${today}.`)
console.log(`Sign in at http://localhost:5173 as ${EMAIL} (local copy only).`)
