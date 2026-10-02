import { describe, expect, it } from 'vitest'
import { pushSupport, urlBase64ToUint8Array } from './push'

const base = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  standalone: true,
  isIOS: true,
  permission: 'default' as const,
}

describe('pushSupport', () => {
  it('asks iPhone users to open the app from the Home Screen first', () => {
    expect(pushSupport({ ...base, standalone: false })).toBe('not-installed')
  })
  it('is ready in the Home Screen app', () => {
    expect(pushSupport(base)).toBe('ready')
  })
  it('reports blocked notifications', () => {
    expect(pushSupport({ ...base, permission: 'denied' })).toBe('blocked')
  })
  it('reports browsers without web push', () => {
    expect(pushSupport({ ...base, isIOS: false, standalone: false, hasPushManager: false })).toBe('not-supported')
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID_-8'))).toEqual([1, 2, 3, 255, 239])
  })
})
