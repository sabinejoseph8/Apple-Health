// Writes the AI explanations (D94, D95, R69 to R75). The score sets every
// status; this only explains it. Two ways in:
// - {"kind": "run"}: the database starts it (a status was built, or the
//   every-minute backup) with the cron key in "x-clarivi-cron", which the
//   database checks (D66). It claims waiting jobs and writes their texts.
// - {"kind": "eval", "cases": [...]}: the owner, signed in, sends made-up
//   inputs and gets back the model's answers and the filter's verdicts. Used
//   to run the test set (docs/ai-eval); touches no one's data.
// Never logs an input, a text, or a person's id.
import { adminClient, corsHeaders, json, userFromRequest } from '../_shared/http.ts'
import { buildMorningInput, digestInputFrom, inputHash, type AiInput } from '../_shared/ai-input.ts'
import { checkOutput } from '../_shared/ai-filter.ts'
import { INSTRUCTION_VERSION } from '../_shared/ai-instruction.ts'
import { type Deps, type Job, processJob } from './runner.ts'
import { anthropicWriter, MODEL } from './writer.ts'

const CLAIM_LIMIT = 5
const EVAL_LIMIT = 60
const EVAL_PARALLEL = 5

function writerFromEnv() {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return null
  return anthropicWriter(key, Deno.env.get('ANTHROPIC_BASE_URL') || undefined)
}

// Reads and writes for one job, through the elevated client; only the
// allow-listed input ever leaves for the model.
function storeFor(admin: ReturnType<typeof adminClient>, write: NonNullable<ReturnType<typeof writerFromEnv>>): Deps {
  return {
    async loadInput(job) {
      if (job.kind === 'morning') {
        const { data: row } = await admin.from('daily_status').select('*').eq('user_id', job.user_id).eq('date', job.for_date).maybeSingle()
        if (!row) return null
        const { data: night } = await admin.from('nights').select('no_stages').eq('user_id', job.user_id).eq('night_date', job.for_date).maybeSingle()
        const { data: zones } = await admin.rpc('status_zones', { p_version: row.settings_version })
        const z = Array.isArray(zones) ? zones[0] : zones
        if (!z) return null
        const input = buildMorningInput(row, night, { ease_off_at: Number(z.ease_off_at), rest_at: Number(z.rest_at) })
        return input ? { input, status: row.status, nudge: row.nudge } : null
      }
      const { data } = await admin.rpc('ai_digest_input', { p_user: job.user_id, p_week_start: job.for_date })
      const input = digestInputFrom(data)
      return input ? { input, status: null, nudge: null } : null
    },
    async existing(job) {
      const { data } = await admin.from('ai_texts').select('input_hash,status,nudge').eq('user_id', job.user_id).eq('kind', job.kind).eq('for_date', job.for_date).maybeSingle()
      return data
    },
    write,
    hash: inputHash,
    async save(job, s) {
      const { error } = await admin.rpc('ai_save', {
        p_user: job.user_id, p_kind: job.kind, p_date: job.for_date, p_body: s.body, p_model: MODEL,
        p_instruction: INSTRUCTION_VERSION, p_hash: s.input_hash, p_status: s.status, p_nudge: s.nudge, p_tries: s.tries,
        p_latency_ms: s.latency_ms, p_input_tokens: s.input_tokens, p_output_tokens: s.output_tokens,
      })
      if (error) throw new Error(`save: ${error.message}`)
    },
    async finish(job) {
      await admin.rpc('ai_finish', { p_user: job.user_id, p_kind: job.kind, p_date: job.for_date })
    },
    async fail(job, error) {
      await admin.rpc('ai_fail', { p_user: job.user_id, p_kind: job.kind, p_date: job.for_date, p_error: error })
    },
  }
}

async function evaluate(cases: { id: string; input: AiInput }[], write: NonNullable<ReturnType<typeof writerFromEnv>>) {
  const out: unknown[] = []
  for (let i = 0; i < cases.length; i += EVAL_PARALLEL) {
    const batch = cases.slice(i, i + EVAL_PARALLEL)
    out.push(...(await Promise.all(batch.map(async (c) => {
      try {
        const w = await write(c.input)
        const fails = checkOutput(c.input, w.output)
        return { id: c.id, ok: fails.length === 0, fails, output: w.output, latency_ms: w.latency_ms, input_tokens: w.input_tokens, output_tokens: w.output_tokens }
      } catch (err) {
        return { id: c.id, ok: false, fails: ['error'], error: err instanceof Error ? err.message : String(err) }
      }
    }))))
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let body: { kind?: unknown; cases?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const admin = adminClient()
  const write = writerFromEnv()

  if (body.kind === 'run') {
    const { data: allowed } = await admin.rpc('cron_key_ok', { p_key: req.headers.get('x-clarivi-cron') ?? '' })
    if (allowed !== true) return json({ error: 'not_allowed' }, 401)
    if (!write) return json({ error: 'no_key' }, 503)
    const { data: jobs, error } = await admin.rpc('ai_claim_jobs', { p_limit: CLAIM_LIMIT })
    if (error) return json({ error: 'claim_failed' }, 500)
    const deps = storeFor(admin, write)
    const outcomes = await Promise.all((jobs as Job[]).map((job) => processJob(job, deps)))
    const tally = { saved: 0, unchanged: 0, failed: 0 }
    for (const o of outcomes) tally[o]++
    console.log(`ai-explain: ${outcomes.length} jobs`, JSON.stringify(tally))
    return json({ jobs: outcomes.length, ...tally })
  }

  if (body.kind === 'eval') {
    const user = await userFromRequest(req, admin)
    if (!user) return json({ error: 'not_signed_in' }, 401)
    const { data: profile } = await admin.from('profiles').select('is_owner').eq('user_id', user.id).maybeSingle()
    if (profile?.is_owner !== true) return json({ error: 'not_owner' }, 403)
    if (!write) return json({ error: 'no_key' }, 503)
    const cases = Array.isArray(body.cases) ? (body.cases as { id: string; input: AiInput }[]) : []
    if (cases.length === 0 || cases.length > EVAL_LIMIT) return json({ error: 'bad_cases' }, 400)
    return json({ model: MODEL, instruction: INSTRUCTION_VERSION, results: await evaluate(cases, write) })
  }

  return json({ error: 'unknown_kind' }, 400)
})
