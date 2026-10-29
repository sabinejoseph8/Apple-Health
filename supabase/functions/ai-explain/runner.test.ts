// D95, R70, R73: one AI job from start to finish, with a fake writer so
// nothing real is called. A text is saved only after the filter passes it;
// a failed filter gets one more try; the input is never saved.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { type Deps, type Job, type Written, processJob } from './runner.ts'
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
