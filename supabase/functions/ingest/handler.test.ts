import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { CleanUpload } from '../_shared/ingest-schema.ts'
import { hashToken } from '../_shared/tokens.ts'
import { wording } from '../_shared/wording.ts'
import { handleIngest, type IngestDeps, type StoreReply } from './handler.ts'

const TOKEN = `clv_${'A'.repeat(43)}`
const NOW = new Date('2026-10-03T10:42:00Z')

const body = {
  schema_version: 1,
  kind: 'daily',
  device_tz_offset_min: -240,
  trigger: 'charger',
  samples: [{ type: 'heart_rate', start: '2026-10-03T03:10:00-04:00', end: '2026-10-03T03:10:00-04:00', value: 52, unit: 'count/min' }],
}

type Call = { tokenHash: string; upload: CleanUpload | null; rejection: string | null }

function fakeStore(answer: StoreReply): { deps: IngestDeps; calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    deps: {
      now: () => NOW,
      store: (tokenHash, upload, rejection) => {
        calls.push({ tokenHash, upload, rejection })
        return Promise.resolve(answer)
      },
    },
  }
}

const stored: StoreReply = { accepted: 1, duplicates: 0, night_complete: true, already_complete_today: false }

function post(payload: unknown, token: string | null = TOKEN, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/functions/v1/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

Deno.test('a good post is stored under the token hash, never the token', async () => {
  const { deps, calls } = fakeStore(stored)
  const res = await handleIngest(post(body), deps)
  assertEquals(res.status, 200)
  assertEquals(calls.length, 1)
  assertEquals(calls[0].tokenHash, await hashToken(TOKEN))
  assertEquals(calls[0].rejection, null)
  assertEquals(calls[0].upload?.samples[0].start_at, '2026-10-03T07:10:00.000Z')
})

Deno.test('the reply holds counts, flags and a message, never readings', async () => {
  const { deps } = fakeStore(stored)
  const reply = await (await handleIngest(post(body), deps)).json()
  assertEquals(Object.keys(reply).sort(), ['accepted', 'already_complete_today', 'duplicates', 'message', 'night_complete'])
  assertEquals(reply.message, wording.sync.nightIn)
})

Deno.test('the message says when the night is not finished or was already in', async () => {
  const partial = fakeStore({ ...stored, night_complete: false })
  assertEquals((await (await handleIngest(post(body), partial.deps)).json()).message, wording.sync.nightNotFinished)
  const ping = fakeStore({ accepted: 0, duplicates: 0, night_complete: false, already_complete_today: true })
  const pingBody = { schema_version: 1, kind: 'ping', device_tz_offset_min: -240 }
  const reply = await (await handleIngest(post(pingBody), ping.deps)).json()
  assertEquals(reply.already_complete_today, true)
  assertEquals(reply.message, wording.sync.alreadyIn)
})

Deno.test('a missing or malformed token is turned away before the database', async () => {
  for (const token of [null, 'not-a-token', `clv_${'A'.repeat(10)}`]) {
    const { deps, calls } = fakeStore(stored)
    const res = await handleIngest(post(body, token), deps)
    assertEquals(res.status, 401)
    assertEquals((await res.json()).message, wording.sync.unknownToken)
    assertEquals(calls.length, 0)
  }
})

Deno.test('only POST is accepted', async () => {
  const { deps, calls } = fakeStore(stored)
  const res = await handleIngest(new Request('http://localhost/functions/v1/ingest', { headers: { Authorization: `Bearer ${TOKEN}` } }), deps)
  assertEquals(res.status, 405)
  assertEquals(calls.length, 0)
})

Deno.test('a bad body is logged with its reason and rejected', async () => {
  const { deps, calls } = fakeStore({ error: 'invalid_body' })
  const res = await handleIngest(post({ ...body, samples: [{ ...body.samples[0], type: 'steps' }] }), deps)
  assertEquals(res.status, 400)
  const reply = await res.json()
  assertEquals(reply.message, wording.sync.notReadable)
  assertEquals(reply.detail, 'sample 1: unknown type')
  assertEquals(calls[0].upload, null)
  assertEquals(calls[0].rejection, 'sample 1: unknown type')
})

Deno.test('text that is not JSON is rejected', async () => {
  const { deps, calls } = fakeStore({ error: 'invalid_body' })
  const res = await handleIngest(post('{"schema_version": 1,'), deps)
  assertEquals(res.status, 400)
  assertEquals(calls[0].rejection, 'not valid JSON')
})

Deno.test('a post over 5 MB is refused without reading it', async () => {
  const { deps, calls } = fakeStore({ error: 'invalid_body' })
  const res = await handleIngest(post(body, TOKEN, { 'Content-Length': String(6 * 1024 * 1024) }), deps)
  assertEquals(res.status, 413)
  assertEquals((await res.json()).message, wording.sync.tooLarge)
  assertEquals(calls[0].rejection, 'body over 5 MB')
})

Deno.test('a post over 5 MB without a declared length is refused too', async () => {
  const { deps } = fakeStore({ error: 'invalid_body' })
  const big = JSON.stringify({ ...body, padding: 'x'.repeat(5 * 1024 * 1024) })
  const req = new Request('http://localhost/functions/v1/ingest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: new Blob([big]).stream(),
  })
  assertEquals((await handleIngest(req, deps)).status, 413)
})

Deno.test('unknown tokens, replaced tokens and too many posts get their own replies', async () => {
  const cases: [StoreReply, number, string][] = [
    [{ error: 'invalid_token' }, 401, wording.sync.unknownToken],
    [{ error: 'token_revoked' }, 401, wording.sync.tokenReplaced],
    [{ error: 'rate_limited' }, 429, wording.sync.tooMany],
  ]
  for (const [answer, status, message] of cases) {
    const { deps } = fakeStore(answer)
    const res = await handleIngest(post(body), deps)
    assertEquals(res.status, status)
    const reply = await res.json()
    assertEquals(reply.message, message)
    assert(!('accepted' in reply))
  }
})

// The Shortcut reads replies as text and looks for these exact pieces
// (scripts/shortcut/build_shortcut.py), so their spelling must not change.
Deno.test('replies contain the exact text the Shortcut looks for', async () => {
  const done = fakeStore({ accepted: 0, duplicates: 0, night_complete: true, already_complete_today: true })
  const text = await (await handleIngest(post(body), done.deps)).text()
  assert(text.includes('"night_complete":true'), text)
  assert(text.includes('"already_complete_today":true'), text)
  const refused = fakeStore({ error: 'token_revoked' })
  assert((await (await handleIngest(post(body), refused.deps)).text()).includes('"error"'))
  const fine = fakeStore(stored)
  assert(!(await (await handleIngest(post(body), fine.deps)).text()).includes('"error"'))
})
