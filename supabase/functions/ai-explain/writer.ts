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
import { DIGEST_INSTRUCTION, MORNING_INSTRUCTION } from '../_shared/ai-instruction.ts'
import type { Written } from './runner.ts'

export const MODEL = 'claude-opus-5-5'
const TIMEOUT_MS = 25_000

const MorningShape = z.object({ explanation: z.string() })
const DigestShape = z.object({ sentences: z.string(), patterns: z.array(z.string()) })

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
