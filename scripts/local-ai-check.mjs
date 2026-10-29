// Local end-to-end check for the AI explanations (D95). Run with:
//   npm run check:local:ai
// Needs the local copy of Supabase (npm run db:start). It starts the functions
// itself, pointed at a FAKE Anthropic server on this machine, so nothing real
// is called and nothing is spent. A made-up person who agreed to consent
// version 3 gets a status: the database queues a job, the function writes a
// text, the filter passes it, the text is saved. Also: one retry after a
// refused text, no job for someone who has not agreed, a refused wrong key,
// and a check that nothing but the allow-listed fields reached the "model".
// Made-up data only, deleted at the end.
import { createClient } from '@supabase/supabase-js'
import http from 'node:http'
import fs from 'node:fs'
import { execSync, spawn } from 'node:child_process'

const st = Object.fromEntries(execSync('npx supabase status -o env')
  .toString().split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(st.API_URL)) throw new Error('local copy only')
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const sql = (q) => execSync('docker exec -i supabase_db_clarivi psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim()
const admin = createClient(st.API_URL, st.SECRET_KEY, { auth: { persistSession: false } })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 90000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(500) } return false }
sql(`delete from auth.users where email like 'ai-check-%@example.test';`)

// ---- the fake Anthropic server: the Messages API's shape, scripted answers.
const requests = []
const verifyRequests = []
let script = []
let verifyScript = []
const GOOD = (input) => input.kind === 'morning'
  ? { explanation: 'Your heart rate variability was below your usual range, which usually means your body is still recovering. Today is a day to take it a little easier. Your sleep and heart rate while you slept were in your usual range.' }
  : { sentences: 'A steady week.', patterns: [] }
const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    // The second check has its own instruction (D95, option 4).
    const checking = String(body.system).startsWith('You check a short weekly summary')
    ;(checking ? verifyRequests : requests).push({ url: req.url, headers: req.headers, body })
    const input = JSON.parse(body.messages[0].content)
    const next = checking
      ? (verifyScript.length > 0 ? verifyScript.shift() : { supported: true, unsupported_claims: [] })
      : script.length > 0 ? script.shift() : GOOD(input)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      id: 'msg_fake', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: JSON.stringify(next) }],
      usage: { input_tokens: 700, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }))
  })
})
await new Promise((r) => server.listen(8789, '0.0.0.0', r))

// ---- the functions, with the fake key and address (a throwaway env file).
const envPath = 'supabase/functions/.env.ai-check'
const base = fs.existsSync('supabase/functions/.env') ? fs.readFileSync('supabase/functions/.env', 'utf8') : ''
fs.writeFileSync(envPath, `${base}\nANTHROPIC_API_KEY=fake-key\nANTHROPIC_BASE_URL=http://${process.env.FAKE_HOST ?? 'host.docker.internal'}:8789\n`)
const serve = spawn('npx', ['supabase', 'functions', 'serve', '--env-file', envPath], { stdio: 'ignore' })
async function cleanup() { serve.kill(); try { execSync('pkill -f "supabase functions serve"') } catch {} server.close(); fs.rmSync(envPath, { force: true }); sql(`delete from auth.users where email like 'ai-check-%@example.test';`) }
process.on('SIGINT', async () => { await cleanup(); process.exit(1) })
sql(`delete from vault.secrets where name = 'clarivi_functions_url';
     select vault.create_secret('http://supabase_kong_clarivi:8000/functions/v1', 'clarivi_functions_url');`)
ok(await until(async () => (await fetch(`${st.API_URL}/functions/v1/ai-explain`, { method: 'POST', body: '{}' }).catch(() => ({ status: 0 }))).status !== 0, 60000), 'the functions are running')

// A wrong key is refused.
let wrongStatus = 0
await until(async () => {
  wrongStatus = (await fetch(`${st.API_URL}/functions/v1/ai-explain`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-clarivi-cron': 'not-the-key' }, body: '{"kind": "run"}' }).catch(() => ({ status: 0 }))).status
  return wrongStatus === 401
}, 30000)
ok(wrongStatus === 401, `the writer refuses a call without the cron key (${wrongStatus})`)

// Two made-up people: one has agreed to consent version 3, one has not.
const today = sql(`select (now() at time zone 'utc')::date`)
async function person(tag, agreed) {
  const { data } = await admin.auth.admin.createUser({ email: `ai-check-${tag}-${Date.now()}@example.test`, password: 'local-ai-check-1', email_confirm: true })
  const id = data.user.id
  if (agreed) sql(`insert into public.consents (user_id, version, agreed_use, agreed_us_storage, agreed_ai) values ('${id}', 4, true, true, true);`)
  return { id, email: data.user.email }
}
const yes = await person('yes', true)
const no = await person('no', false)
const points = JSON.stringify({
  hrv: { value: 38, normal: 52, range_low: 40, range_high: 64, verdict: 'below', spreads_worse: 2.33, counted: true, points: 0.93 },
  sleep: { value: 420, normal: 430, range_low: 362, range_high: 498, verdict: 'in_range', spreads_worse: 0.3, counted: true, points: 0.08 },
  sleeping_hr: { value: 51, normal: 50, range_low: 45, range_high: 55, verdict: 'in_range', spreads_worse: 0.4, counted: true, points: 0.14 },
})
const addStatus = (id) => sql(`delete from public.daily_status where user_id = '${id}' and date = '${today}';
  insert into public.daily_status (user_id, date, status, readings_used, points, total, nudge, reason_codes, composite_fired, settings_version)
  values ('${id}', '${today}', 'ease_off', 3, '${points}', 1.15, 'train_easy', array['hrv_outside_range'], false, 3);`)

// 1. A status for someone who agreed: queued at once, written, filtered, saved.
addStatus(yes.id)
ok(sql(`select count(*) from public.ai_jobs where user_id = '${yes.id}'`) === '1', 'a status queues one job for a person who agreed')
ok(await until(() => sql(`select count(*) from public.ai_texts where user_id = '${yes.id}'`) === '1'), 'the text is written and saved')
const saved = sql(`select model || '|' || instruction_version || '|' || tries || '|' || status || '|' || nudge || '|' || input_tokens || '|' || output_tokens from public.ai_texts where user_id = '${yes.id}'`)
const version = fs.readFileSync('supabase/functions/_shared/ai-instruction.ts', 'utf8').match(/INSTRUCTION_VERSION = '([^']+)'/)[1]
ok(saved === `claude-opus-5-5|${version}|1|ease_off|train_easy|700|80`, `saved with the model, instruction version, tries, status, nudge and tokens (${saved})`)
ok(sql(`select status from public.ai_jobs where user_id = '${yes.id}'`) === 'done', 'and the job is done')
ok(requests.length === 1, 'the fake model was asked once')
const r = requests[0]
const sent = JSON.stringify(r.body)
ok((r.headers.authorization === 'Bearer fake-key' || r.headers['x-api-key'] === 'fake-key') && r.body.model === 'claude-opus-5-5', 'it asked claude-opus-5-5 with the key from the secret store')
ok(!('temperature' in r.body) && !('top_p' in r.body) && !('top_k' in r.body), 'with no sampling settings (Opus 5.5 refuses them)')
ok(r.body.output_config?.format?.type === 'json_schema' && r.body.output_config?.effort === 'low', 'asking for strict JSON at low effort')
ok(!sent.includes(yes.id) && !sent.includes(yes.email) && !sent.includes(today), 'nothing identifying was sent: no id, no email, no date')
ok(JSON.parse(r.body.messages[0].content).flags.sleep_floor === false, 'only the allow-listed input was sent')

// 2. The same day again with the same input and status: nothing written twice.
const before = requests.length
sql(`select public.ai_enqueue('${yes.id}', 'morning', '${today}'::date);`)
sql(`select public.ai_start();`)
await until(() => sql(`select status from public.ai_jobs where user_id = '${yes.id}'`) === 'done', 30000)
ok(requests.length === before, 'the same input is not sent twice')

// 3. A refused text gets one more try.
script = [{ explanation: 'You may be getting sick, so take it easy today.' }]
sql(`delete from public.ai_texts where user_id = '${yes.id}';`)
addStatus(yes.id)
ok(await until(() => sql(`select tries from public.ai_texts where user_id = '${yes.id}'`) === '2'), 'a text the filter refuses is tried again, and the second is saved')
ok(sql(`select body ->> 'explanation' from public.ai_texts where user_id = '${yes.id}'`).includes('usual range'), 'the refused text was never kept')

// 4. Two refused texts: nothing saved, the job waits to try again.
script = [{ explanation: 'You may be getting sick.' }, { explanation: 'See your doctor about this.' }]
sql(`delete from public.ai_texts where user_id = '${yes.id}';`)
addStatus(yes.id)
ok(await until(() => sql(`select last_error from public.ai_jobs where user_id = '${yes.id}'`).startsWith('filtered:')), 'two refused texts fail the try with the reasons')
ok(sql(`select count(*) from public.ai_texts where user_id = '${yes.id}'`) === '0', 'and nothing is saved, so the card shows the fixed wording')

// 5. A weekly digest is written, then read against the data by a second check.
const week = '2026-08-03'
sql(`insert into public.digests (user_id, week_start, facts) values ('${yes.id}', '${week}', '{}');`)
ok(await until(() => sql(`select count(*) from public.ai_texts where user_id = '${yes.id}' and kind = 'digest'`) === '1'), 'a digest is written and saved')
ok(verifyRequests.length === 1, 'a second check read it against the data')
const checked = JSON.parse(verifyRequests[0].body.messages[0].content)
ok(Array.isArray(checked.data.days) && typeof checked.summary.sentences === 'string', 'the check was given the same input and the text, nothing more')
ok(!JSON.stringify(verifyRequests[0].body).includes(yes.id) && !JSON.stringify(verifyRequests[0].body).includes(yes.email), 'and nothing identifying')
ok(Number(sql(`select input_tokens from public.ai_texts where user_id = '${yes.id}' and kind = 'digest'`)) === 1400, 'the saved tokens count the check too')

// 6. A digest the check refuses twice is not saved, and the job waits to try again.
verifyScript = [{ supported: false, unsupported_claims: ['sleep got longer each night'] }, { supported: false, unsupported_claims: ['another claim'] }]
sql(`delete from public.ai_texts where user_id = '${yes.id}' and kind = 'digest'; delete from public.digests where user_id = '${yes.id}';
     insert into public.digests (user_id, week_start, facts) values ('${yes.id}', '${week}', '{}');`)
ok(await until(() => sql(`select last_error from public.ai_jobs where user_id = '${yes.id}' and kind = 'digest'`) === 'filtered:unverified'), 'a digest with unsupported claims fails with a reason')
ok(sql(`select count(*) from public.ai_texts where user_id = '${yes.id}' and kind = 'digest'`) === '0', 'and nothing is saved, so the fixed digest shows')

// 7. Someone who has not agreed gets no job and nothing is sent. (The refused digest above is still
// waiting to try again; end it so the every-minute job cannot count as a call made for them.)
sql(`update public.ai_jobs set status = 'failed' where user_id = '${yes.id}'`)
const asked = requests.length
addStatus(no.id)
await wait(3000)
ok(sql(`select count(*) from public.ai_jobs where user_id = '${no.id}'`) === '0', 'a person who has not agreed has no job')
ok(requests.length === asked, 'and nothing is sent for them')

await cleanup()
console.log(process.exitCode ? 'Some checks failed.' : 'All checks passed.')
