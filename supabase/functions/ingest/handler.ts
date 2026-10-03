// The ingest server function's logic, kept apart from Deno.serve and the
// database client so it can be tested on its own (tech-spec section 8).
//
// The Shortcut posts with "Authorization: Bearer <upload token>". The token is
// hashed here and only the hash goes to the database, which works out the
// user from it. Replies hold counts, flags and a message, never readings.

import { type CleanUpload, MAX_BODY_BYTES, parseUpload } from '../_shared/ingest-schema.ts'
import { hashToken, looksLikeUploadToken } from '../_shared/tokens.ts'
import { wording } from '../_shared/wording.ts'

export type StoreError = 'invalid_token' | 'token_revoked' | 'rate_limited' | 'invalid_body'

export type StoreReply =
  | { accepted: number; duplicates: number; night_complete: boolean; already_complete_today: boolean }
  | { error: StoreError }

export interface IngestDeps {
  // Calls ingest_upload(): an upload to store, or the reason it was rejected.
  store(tokenHash: string, upload: CleanUpload | null, rejection: string | null): Promise<StoreReply>
  now(): Date
}

const w = wording.sync

function reply(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Reads at most `limit` bytes; null if the body is longer.
async function readLimited(req: Request, limit: number): Promise<string | null> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}

function rejected(error: StoreError, detail: string | null, tooLarge: boolean): Response {
  switch (error) {
    case 'invalid_token':
      return reply({ error, message: w.unknownToken }, 401)
    case 'token_revoked':
      return reply({ error, message: w.tokenReplaced }, 401)
    case 'rate_limited':
      return reply({ error, message: w.tooMany }, 429)
    case 'invalid_body':
      if (tooLarge) return reply({ error: 'too_large', message: w.tooLarge }, 413)
      return reply({ error, message: w.notReadable, detail }, 400)
  }
}

export async function handleIngest(req: Request, deps: IngestDeps): Promise<Response> {
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!looksLikeUploadToken(token)) return reply({ error: 'invalid_token', message: w.unknownToken }, 401)
  const tokenHash = await hashToken(token)

  const declared = Number(req.headers.get('Content-Length') ?? '0')
  const raw = declared > MAX_BODY_BYTES ? null : await readLimited(req, MAX_BODY_BYTES)

  let upload: CleanUpload | null = null
  let rejection: string | null = null
  if (raw === null) {
    rejection = 'body over 5 MB'
  } else {
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      rejection = 'not valid JSON'
    }
    if (!rejection) {
      const parsed = parseUpload(body, deps.now())
      if (parsed.ok) upload = parsed.upload
      else rejection = parsed.error
    }
  }

  const result = await deps.store(tokenHash, upload, rejection)
  if ('error' in result) return rejected(result.error, rejection, raw === null)

  let message: string
  if (upload?.kind === 'backfill') message = w.monthIn
  else if (result.already_complete_today) message = w.alreadyIn
  else if (upload?.kind === 'ping') message = w.notYet
  else message = result.night_complete ? w.nightIn : w.nightNotFinished

  return reply(
    {
      accepted: result.accepted,
      duplicates: result.duplicates,
      night_complete: result.night_complete,
      already_complete_today: result.already_complete_today,
      message,
    },
    200,
  )
}
