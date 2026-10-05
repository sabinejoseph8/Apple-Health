// The security headers the app is served with live in vercel.json, which
// Vercel reads. The screen tests serve a production build with the same
// headers; the only change is the database address, the tests' made-up
// database instead of the live project.
import { readFileSync } from 'node:fs'

export const LIVE_DATABASE = 'https://vuynnnrijdbvamwfauog.supabase.co'

type Header = { key: string; value: string }

// The headers on every page and file.
export function siteHeaders(): Header[] {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers: { source: string; headers: Header[] }[]
  }
  return config.headers.find((rule) => rule.source === '/(.*)')?.headers ?? []
}

export function testHeaders(databaseUrl: string): Record<string, string> {
  const origin = new URL(databaseUrl).origin
  return Object.fromEntries(siteHeaders().map(({ key, value }) => [key, value.replaceAll(LIVE_DATABASE, origin)]))
}
