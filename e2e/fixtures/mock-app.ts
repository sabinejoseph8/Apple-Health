// Runs the app signed in as a made-up tester, with the phone's clock fixed
// and the database's answers made up, so the screens can be tested at iPhone
// size without a database. Nothing here is anyone's real data.
import type { Page, Route } from '@playwright/test'

export const TZ = 'America/Cayman' // UTC-5 all year, like the design's sample day

const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tester@example.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-09-01T00:00:00Z',
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const FOREVER = 4102444800 // 2100
const SESSION = {
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp: FOREVER })}.made-up`,
  refresh_token: 'made-up',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: FOREVER,
  user: USER,
}

// The database's answers, by table (and by function for "rpc/<name>").
export type Tables = Partial<Record<string, unknown[]>>

export interface MockApp {
  // Every call the app made to a database function, in order.
  calls: { name: string; body: unknown }[]
  // Every table the app read, in order.
  reads: string[]
}

// The clock is fixed at `at`; with `ticking`, it starts there and the test
// moves it on with page.clock.fastForward.
export async function openApp(
  page: Page,
  { at, tables, path = '/', ticking = false }: { at: string; tables: Tables; path?: string; ticking?: boolean },
): Promise<MockApp> {
  const app: MockApp = { calls: [], reads: [] }
  if (ticking) await page.clock.install({ time: new Date(at) })
  else await page.clock.setFixedTime(new Date(at))
  await page.addInitScript((session) => localStorage.setItem('clarivi-auth', session), JSON.stringify(SESSION))

  await page.route('http://127.0.0.1:54321/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    // Signing in again gives a session; signing out (anywhere) succeeds.
    if (url.pathname === '/auth/v1/token') {
      app.calls.push({ name: 'auth:sign-in', body: null })
      return json(SESSION)
    }
    if (url.pathname === '/auth/v1/logout') {
      app.calls.push({ name: `auth:sign-out:${url.searchParams.get('scope') ?? 'local'}`, body: null })
      return route.fulfill({ status: 204 })
    }
    if (url.pathname.startsWith('/auth/v1/')) return json(USER)
    // Server functions: "fn/<name>" in the tables gives the reply, else ok.
    if (url.pathname.startsWith('/functions/v1/')) {
      const fn = url.pathname.replace('/functions/v1/', '')
      app.calls.push({ name: `fn:${fn}`, body: route.request().postDataJSON() })
      const reply = (tables[`fn/${fn}`] as { status: number; body: unknown }[] | undefined)?.shift()
      return json(reply?.body ?? { ok: true }, reply?.status ?? 200)
    }
    const name = url.pathname.replace('/rest/v1/', '')
    if (name.startsWith('rpc/')) {
      app.calls.push({ name: name.slice(4), body: route.request().postDataJSON() })
      const rows = tables[name]
      return rows ? json(rows) : route.fulfill({ status: 204 })
    }
    app.reads.push(name)
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
  })

  await page.goto(path)
  return app
}

// An accepted morning sync at the given moment, on that local date.
export function dailySync(isoWithOffset: string, extra: object = {}) {
  return {
    received_at: new Date(isoWithOffset).toISOString(),
    kind: 'daily',
    status: 'accepted',
    error: null,
    local_date: isoWithOffset.slice(0, 10),
    night_complete: true,
    ...extra,
  }
}
