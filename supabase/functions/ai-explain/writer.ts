// The one place that talks to Claude (D94, D95). Claude Opus 5.5 is Sabine's
// final choice (no comparison with other models). It takes no temperature
// or sampling settings and can't have thinking turned off, so the only
// controls are effort (low: this is a short plain-words job) and the strict
// JSON shape below, which the API enforces. No retries here: the job runner
// tries once more when the filter refuses, and a failed job is queued again.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@1.3.0/helpers/zod'
import { z } from 'npm:zod@4.6.4'
import type { AiInput } from '../_shared/ai-input.ts'
import type { DigestOutput, MorningOutput } from '../_shared/ai-filter.ts'
import { DIGEST_INSTRUCTION, MORNING_INSTRUCTION, VERIFY_INSTRUCTION } from '../_shared/ai-instruction.ts'
import type { Verified, Written } from './runner.ts'

export const MODEL = 'claude-opus-5-5'
const TIMEOUT_MS = 25_000

const MorningShape = z.object({ explanation: z.string() })
const DigestShape = z.object({ sentences: z.string(), patterns: z.array(z.string()) })
const VerifyShape = z.object({ supported: z.boolean(), unsupported_claims: z.array(z.string()) })

export function anthropicWriter(apiKey: string, baseURL?: string): (input: AiInput) => Promise<Written> {
  const client = new Anthropic({ apiKey, baseURL, maxRetries: 0, timeout: TIMEOUT_MS })
  return async (input) => {
    const started = Date.now()
    const base = {
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user' as const, content: JSON.stringify(input) }],
    }
    const response =
      input.kind === 'morning'
        ? await client.messages.parse({
          ...base,
          system: MORNING_INSTRUCTION,
          output_config: { effort: 'low', format: zodOutputFormat(MorningShape) },
        })
        : await client.messages.parse({
          ...base,
          system: DIGEST_INSTRUCTION,
          output_config: { effort: 'low', format: zodOutputFormat(DigestShape) },
        })
    if (response.stop_reason === 'refusal') throw new Error('refusal')
    if (!response.parsed_output) throw new Error('unparsed')
    return {
      output: response.parsed_output,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      latency_ms: Date.now() - started,
    }
  }
}

// The second check (D95, option 4): the same model, with its own instruction,
// reads every claim in a digest against the data. It never sees more than the
// writer saw. Any failure is an error, never "supported": a text that could
// not be checked is not shown.
export function anthropicVerifier(apiKey: string, baseURL?: string): (input: AiInput, output: MorningOutput | DigestOutput) => Promise<Verified> {
  const client = new Anthropic({ apiKey, baseURL, maxRetries: 0, timeout: TIMEOUT_MS })
  return async (input, output) => {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1000,
      system: VERIFY_INSTRUCTION,
      messages: [{ role: 'user', content: JSON.stringify({ data: input, summary: output }) }],
      output_config: { effort: 'low', format: zodOutputFormat(VerifyShape) },
    })
    if (response.stop_reason === 'refusal') throw new Error('refusal')
    if (!response.parsed_output) throw new Error('unparsed')
    const { supported, unsupported_claims } = response.parsed_output
    return {
      ok: supported === true && unsupported_claims.length === 0,
      unsupported: unsupported_claims,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }
  }
}
