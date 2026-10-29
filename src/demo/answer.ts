// The made-up database's answers (D95). One place decides what each request to the
// database gets back, so the screen tests (e2e/fixtures/mock-app.ts, which answers at
// the browser's network layer) and the demo build (src/demo/install.ts, which answers
// inside the page) behave the same. Nothing here is anyone's real data.
import { wording } from '../../supabase/functions/_shared/wording'

export const TZ = 'America/Cayman' // UTC-5 all year, like the design's sample day

export const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tester@example.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-09-01T00:00:00Z',
}

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const FOREVER = 4102444800 // 2100
export const SESSION = {
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp: FOREVER })}.made-up`,
  refresh_token: 'made-up',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: FOREVER,
  user: USER,
}

// The database's answers, by table (and by function for "rpc/<name>").
export type Tables = Partial<Record<string, unknown[]>>

// The made-up tester has agreed to the consent text (D79), unless a test gives
// its own "consents" rows (an empty list: not agreed yet).
export function withConsent(tables: Tables): Tables {
  return { consents: [{ version: wording.consent.version, agreed_at: '2026-09-01T12:00:00Z' }], ...tables }
}

export interface MockState {
  tables: Tables
  // Every call the app made to a database function, in order.
  calls: { name: string; body: unknown }[]
  // Every table the app read, in order.
  reads: string[]
  // The demo build keeps the person's own answers (check-in, follow-through) so the
  // card shows them; the screen tests leave the tables as the test wrote them.
  stateful?: boolean
  now?: () => Date
}

export interface MockRequest {
  url: string
  // Read lazily: only the calls that have a body ask for it.
  body: () => unknown
}

export interface MockReply {
  status: number
  body?: unknown
  // The reply is a lost connection, not an answer.
  abort?: boolean
}

const json = (body: unknown, status = 200): MockReply => ({ status, body })

// An answer, or null when the request is not for the database.
export function answerRequest(state: MockState, req: MockRequest): MockReply {
  const { tables } = state
  const url = new URL(req.url)

  // Signing in again gives a session; signing out (anywhere) succeeds.
  if (url.pathname === '/auth/v1/token') {
    state.calls.push({ name: 'auth:sign-in', body: null })
    return json(SESSION)
  }
  if (url.pathname === '/auth/v1/logout') {
    state.calls.push({ name: `auth:sign-out:${url.searchParams.get('scope') ?? 'local'}`, body: null })
    return { status: 204 }
  }
  // "auth/user" in the tables gives the sign-in check's reply (status 0: no
  // connection), else the user.
  if (url.pathname === '/auth/v1/user') {
    const reply = (tables['auth/user'] as { status: number; body: unknown }[] | undefined)?.[0]
    if (reply?.status === 0) return { status: 0, abort: true }
    return json(reply?.body ?? USER, reply?.status ?? 200)
  }
  if (url.pathname.startsWith('/auth/v1/')) return json(USER)

  // Server functions: "fn/<name>" in the tables gives the reply, else ok.
  if (url.pathname.startsWith('/functions/v1/')) {
    const fn = url.pathname.replace('/functions/v1/', '')
    state.calls.push({ name: `fn:${fn}`, body: req.body() })
    const reply = (tables[`fn/${fn}`] as { status: number; body: unknown }[] | undefined)?.shift()
    return json(reply?.body ?? { ok: true }, reply?.status ?? 200)
  }

  const name = url.pathname.replace('/rest/v1/', '')
  if (name.startsWith('rpc/')) {
    const body = req.body()
    state.calls.push({ name: name.slice(4), body })
    if (state.stateful) remember(state, name.slice(4), body)
    const rows = tables[name]
    return rows ? json(rows) : { status: 204 }
  }

  state.reads.push(name)
  // Import progress asks for months; everything else gets the table's rows,
  // narrowed by simple filters on the columns the made-up rows have.
  const select = url.searchParams.get('select') ?? ''
  let rows = ((select.includes('month_id') ? tables['uploads:months'] : tables[name]) ?? []) as Record<string, unknown>[]
  for (const [column, filter] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset'].includes(column)) continue
    const [op, ...rest] = filter.split('.')
    const want = rest.join('.')
    rows = rows.filter((row) => {
      if (!(column in row)) return true
      const have = String(row[column])
      if (op === 'eq') return have === want
      if (op === 'gte') return have >= want
      if (op === 'lte') return have <= want
      if (op === 'in') return want.replace(/[()"]/g, '').split(',').includes(have)
      return true
    })
  }
  const limit = url.searchParams.get('limit')
  if (limit) rows = rows.slice(0, Number(limit))
  return json(rows)
}

// The demo keeps what the person taps, so the card shows it on the next read.
function remember(state: MockState, fn: string, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>
  const at = (state.now?.() ?? new Date()).toISOString()
  const put = (table: string, row: Record<string, unknown>) => {
    const rows = (state.tables[table] ??= []) as Record<string, unknown>[]
    const i = rows.findIndex((r) => r.date === row.date)
    if (i >= 0) rows[i] = { ...rows[i], ...row }
    else rows.push(row)
  }
  if (fn === 'submit_checkin') {
    const existing = ((state.tables.checkins ?? []) as Record<string, unknown>[]).some((r) => r.date === b.p_date)
    put('checkins', { date: b.p_date, answer: b.p_answer, answered_at: at, status_seen_before: b.p_status_seen === true, is_first: !existing })
  } else if (fn === 'submit_followthrough') {
    put('followthrough', { date: b.p_date, answer: b.p_answer, answered_at: at, channel: b.p_channel })
  }
}
