import { describe, expect, it } from 'vitest'
import { LIVE_DATABASE, siteHeaders, testHeaders } from './csp-config.ts'

// Phase 6: a strict Content Security Policy, so the app can only run its own
// code and only talk to itself and the live project (tech-spec, Privacy).
const headers = Object.fromEntries(siteHeaders().map(({ key, value }) => [key, value]))
const csp = headers['Content-Security-Policy'] ?? ''
const policy = Object.fromEntries(
  csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .map(([name, ...values]) => [name, values]),
)

describe('the security headers', () => {
  it('apply to every page and file', () => {
    expect(csp).not.toBe('')
  })

  it('let the app run only its own code', () => {
    expect(policy['default-src']).toEqual(["'none'"])
    expect(policy['script-src']).toEqual(["'self'"])
    expect(policy['style-src']).toEqual(["'self'"])
    expect(policy['worker-src']).toEqual(["'self'"])
  })

  it('allow no inline code, no eval, no wildcard and no other site', () => {
    for (const [name, values] of Object.entries(policy)) {
      for (const value of values) {
        expect(value, name).not.toMatch(/unsafe|\*|^(http|data|blob):/)
        if (value.startsWith('https:')) expect([name, value]).toEqual(['connect-src', LIVE_DATABASE])
      }
    }
  })

  it('connect only to the app itself and the live project', () => {
    expect(policy['connect-src']).toEqual(["'self'", LIVE_DATABASE])
  })

  it('refuse framing, plugins and a changed base address', () => {
    expect(policy['frame-ancestors']).toEqual(["'none'"])
    expect(policy['object-src']).toEqual(["'none'"])
    expect(policy['base-uri']).toEqual(["'none'"])
    expect(headers['X-Frame-Options']).toBe('DENY')
  })

  it('send no referrer and stop content sniffing', () => {
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('in the screen tests, change only the database address', () => {
    const local = 'http://127.0.0.1:54321'
    expect(testHeaders(local)['Content-Security-Policy']).toBe(csp.replace(LIVE_DATABASE, local))
    expect(testHeaders(`${local}/`)['Referrer-Policy']).toBe('no-referrer')
  })
})
