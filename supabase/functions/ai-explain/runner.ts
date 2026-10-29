// One AI job from start to finish (D95, R70, R73), with every outside thing
// passed in, so tests run it with a fake writer: load the input from the
// allow-list, skip it if the same text is already on file, ask the model, run
// the filter, try once more if the filter refuses, then save the text or fail
// the job with a short reason. Never saves the input or a refused text.

import { type AiInput } from '../_shared/ai-input.ts'
import { checkOutput, type DigestOutput, type MorningOutput } from '../_shared/ai-filter.ts'

export interface Job {
  user_id: string
  kind: 'morning' | 'digest'
  for_date: string
}

export interface Written {
  output: MorningOutput | DigestOutput
  input_tokens: number
  output_tokens: number
  latency_ms: number
}

export interface Saved {
  body: MorningOutput | DigestOutput
  input_hash: string
  status: string | null
  nudge: string | null
  tries: number
  latency_ms: number
  input_tokens: number
  output_tokens: number
}

export interface Deps {
  loadInput(job: Job): Promise<{ input: AiInput; status: string | null; nudge: string | null } | null>
  existing(job: Job): Promise<{ input_hash: string; status: string | null; nudge: string | null } | null>
  write(input: AiInput): Promise<Written>
  hash(input: AiInput): Promise<string>
  save(job: Job, saved: Saved): Promise<void>
  finish(job: Job): Promise<void>
  fail(job: Job, error: string): Promise<void>
}

export type Outcome = 'saved' | 'unchanged' | 'failed'

const TRIES = 2

export async function processJob(job: Job, deps: Deps): Promise<Outcome> {
  try {
    const loaded = await deps.loadInput(job)
    if (!loaded) {
      await deps.fail(job, 'no_input')
      return 'failed'
    }
    const { input, status, nudge } = loaded
    const hash = await deps.hash(input)
    const have = await deps.existing(job)
    if (have && have.input_hash === hash && have.status === status && have.nudge === nudge) {
      await deps.finish(job)
      return 'unchanged'
    }

    let lastFails: string[] = []
    for (let tries = 1; tries <= TRIES; tries++) {
      const written = await deps.write(input)
      lastFails = checkOutput(input, written.output)
      if (lastFails.length === 0) {
        await deps.save(job, {
          body: written.output,
          input_hash: hash,
          status,
          nudge,
          tries,
          latency_ms: written.latency_ms,
          input_tokens: written.input_tokens,
          output_tokens: written.output_tokens,
        })
        return 'saved'
      }
    }
    await deps.fail(job, `filtered:${lastFails.join('+')}`)
    return 'failed'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await deps.fail(job, `error: ${message}`).catch(() => {})
    return 'failed'
  }
}
