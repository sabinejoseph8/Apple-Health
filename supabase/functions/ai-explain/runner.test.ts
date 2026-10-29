// D95, R70, R73: one AI job from start to finish, with a fake writer so
// nothing real is called. A text is saved only after the filter passes it;
// a failed filter gets one more try; the input is never saved.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { type Deps, type Job, type Verified, type Written, processJob } from './runner.ts'
import type { DigestInput } from '../_shared/ai-input.ts'
import type { DigestOutput } from '../_shared/ai-filter.ts'
import type { MorningInput } from '../_shared/ai-input.ts'
import type { MorningOutput } from '../_shared/ai-filter.ts'

const JOB: Job = { user_id: 'u1', kind: 'morning', for_date: '2026-08-03' }
const INPUT: MorningInput = {
  kind: 'morning', status: 'ready', nudge: 'train_as_planned', readings_used: 3, total: 0.2, ease_off_at: 1.2, rest_at: 2.4,
  readings: [], flags: { late_sync: false, no_sleep_stages: false, illness_pattern: false, sleep_floor: false },
}
const GOOD = 'Your readings last night were all in your usual range. Your body looks ready for whatever you have planned.'
const BAD = 'You may be getting sick, so take it easy.'

function fake(over: Partial<Deps> & { outputs?: string[] }) {
  const calls: { saved: unknown[]; failed: string[]; finished: number; wrote: number } = { saved: [], failed: [], finished: 0, wrote: 0 }
  const outputs = [...(over.outputs ?? [GOOD])]
  const deps: Deps = {
    loadInput: () => Promise.resolve({ input: INPUT, status: 'ready', nudge: 'train_as_planned' }),
    existing: () => Promise.resolve(null),
    write: () => {
      calls.wrote++
      const text = outputs.shift() ?? GOOD
      return Promise.resolve<Written>({ output: { explanation: text } as MorningOutput, input_tokens: 700, output_tokens: 80, latency_ms: 4000 })
    },
    hash: () => Promise.resolve('h1'),
    save: (_job, saved) => { calls.saved.push(saved); return Promise.resolve() },
    finish: () => { calls.finished++; return Promise.resolve() },
    fail: (_job, error) => { calls.failed.push(error); return Promise.resolve() },
    ...over,
  }
  return { deps, calls }
}

Deno.test('a good text is saved on the first try, with its hash and no input', async () => {
  const { deps, calls } = fake({})
  assertEquals(await processJob(JOB, deps), 'saved')
  assertEquals(calls.wrote, 1)
  assertEquals(calls.saved.length, 1)
  const s = calls.saved[0] as Record<string, unknown>
  assertEquals(s.tries, 1)
  assertEquals(s.input_hash, 'h1')
  assertEquals((s.body as { explanation: string }).explanation, GOOD)
  assertEquals([s.status, s.nudge], ['ready', 'train_as_planned'])
  assert(!JSON.stringify(s).includes('readings_used'), 'the input is never saved')
})

Deno.test('a text the filter rejects gets one more try', async () => {
  const { deps, calls } = fake({ outputs: [BAD, GOOD] })
  assertEquals(await processJob(JOB, deps), 'saved')
  assertEquals(calls.wrote, 2)
  assertEquals((calls.saved[0] as { tries: number }).tries, 2)
})

Deno.test('two rejected texts fail the job and save nothing', async () => {
  const { deps, calls } = fake({ outputs: [BAD, BAD] })
  assertEquals(await processJob(JOB, deps), 'failed')
  assertEquals(calls.saved.length, 0)
  assertEquals(calls.failed.length, 1)
  assert(calls.failed[0].startsWith('filtered:'), calls.failed[0])
  assert(calls.failed[0].includes('no_condition_words'))
  assert(!calls.failed[0].includes('sick'), 'the rejected text is never kept')
})

Deno.test('a model error fails the job without trying again in this run', async () => {
  const { deps, calls } = fake({ write: () => Promise.reject(new Error('timeout after 25000ms')) })
  assertEquals(await processJob(JOB, deps), 'failed')
  assertEquals(calls.saved.length, 0)
  assertEquals(calls.failed, ['error: timeout after 25000ms'])
})

Deno.test('the same input and status already on file finishes without writing', async () => {
  const { deps, calls } = fake({ existing: () => Promise.resolve({ input_hash: 'h1', status: 'ready', nudge: 'train_as_planned' }) })
  assertEquals(await processJob(JOB, deps), 'unchanged')
  assertEquals([calls.wrote, calls.finished, calls.saved.length], [0, 1, 0])
})

Deno.test('a text on file for another status is written again', async () => {
  const { deps, calls } = fake({ existing: () => Promise.resolve({ input_hash: 'old', status: 'rest', nudge: 'rest' }) })
  assertEquals(await processJob(JOB, deps), 'saved')
  assertEquals(calls.wrote, 1)
})

Deno.test('a day that no longer has a status fails with a reason', async () => {
  const { deps, calls } = fake({ loadInput: () => Promise.resolve(null) })
  assertEquals(await processJob(JOB, deps), 'failed')
  assertEquals(calls.failed, ['no_input'])
})

Deno.test('a thrown error in the store is reported as a failure, not a crash', async () => {
  const { deps, calls } = fake({ loadInput: () => Promise.reject(new Error('db down')) })
  assertEquals(await processJob(JOB, deps), 'failed')
  assertEquals(calls.failed, ['error: db down'])
})

// D95, option 4 (Sabine): a second model reads every claim in a digest against
// the data before it is shown. Morning texts are not checked this way.
const DIGEST_JOB: Job = { user_id: 'u1', kind: 'digest', for_date: '2026-08-03' }
const DIGEST_INPUT: DigestInput = {
  kind: 'digest',
  days: [{ weekday: 'Monday', status: 'ready', nudge: 'train_as_planned', followed: 'yes', checkin: 'okay', hrv: 48, sleeping_hr: 56, sleep: 400 }],
  prior_weeks: [],
}
const DIGEST_GOOD: DigestOutput = { sentences: 'Every day with a status was Ready this week.', patterns: [] }
const verdict = (ok: boolean, unsupported: string[] = []): Verified => ({ ok, unsupported, input_tokens: 900, output_tokens: 40 })

function digestFake(verifies: Verified[]) {
  const calls = { saved: [] as { tries: number; input_tokens: number; output_tokens: number }[], failed: [] as string[], verified: 0, wrote: 0 }
  const queue = [...verifies]
  const deps: Deps = {
    loadInput: () => Promise.resolve({ input: DIGEST_INPUT, status: null, nudge: null }),
    existing: () => Promise.resolve(null),
    write: () => { calls.wrote++; return Promise.resolve({ output: DIGEST_GOOD, input_tokens: 1000, output_tokens: 100, latency_ms: 3000 }) },
    verify: () => { calls.verified++; return Promise.resolve(queue.shift() ?? verdict(true)) },
    hash: () => Promise.resolve('h2'),
    save: (_j, saved) => { calls.saved.push(saved); return Promise.resolve() },
    finish: () => Promise.resolve(),
    fail: (_j, error) => { calls.failed.push(error); return Promise.resolve() },
  }
  return { deps, calls }
}

Deno.test('a digest whose claims are all supported is saved, with the check counted in the tokens', async () => {
  const { deps, calls } = digestFake([verdict(true)])
  assertEquals(await processJob(DIGEST_JOB, deps), 'saved')
  assertEquals([calls.wrote, calls.verified], [1, 1])
  assertEquals(calls.saved[0], { ...calls.saved[0], tries: 1, input_tokens: 1900, output_tokens: 140 })
})

Deno.test('a digest with an unsupported claim is written again, and the second try can pass', async () => {
  const { deps, calls } = digestFake([verdict(false, ['sleep got longer each night']), verdict(true)])
  assertEquals(await processJob(DIGEST_JOB, deps), 'saved')
  assertEquals([calls.wrote, calls.verified, calls.saved[0].tries], [2, 2, 2])
})

Deno.test('two unsupported digests fail the job, save nothing and never keep the claim', async () => {
  const { deps, calls } = digestFake([verdict(false, ['sleep got longer each night']), verdict(false, ['another claim'])])
  assertEquals(await processJob(DIGEST_JOB, deps), 'failed')
  assertEquals(calls.saved.length, 0)
  assertEquals(calls.failed, ['filtered:unverified'])
  assert(!calls.failed[0].includes('longer'))
})

Deno.test('if the check itself fails, nothing is shown (it fails safe)', async () => {
  const { deps, calls } = digestFake([])
  deps.verify = () => Promise.reject(new Error('timeout after 25000ms'))
  assertEquals(await processJob(DIGEST_JOB, deps), 'failed')
  assertEquals(calls.saved.length, 0)
  assertEquals(calls.failed, ['error: timeout after 25000ms'])
})

Deno.test('a text the word filter refuses is not sent to the checker', async () => {
  const { deps, calls } = digestFake([])
  deps.write = () => Promise.resolve({ output: { sentences: 'You may be getting sick.', patterns: [] }, input_tokens: 1000, output_tokens: 50, latency_ms: 2000 })
  assertEquals(await processJob(DIGEST_JOB, deps), 'failed')
  assertEquals(calls.verified, 0)
})

Deno.test('morning texts are not checked by a second model', async () => {
  const { deps, calls } = fake({})
  let verified = 0
  deps.verify = () => { verified++; return Promise.resolve(verdict(true)) }
  assertEquals(await processJob(JOB, deps), 'saved')
  assertEquals(verified, 0)
  assertEquals(calls.saved.length, 1)
})
