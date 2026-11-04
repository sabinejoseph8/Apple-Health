import { describe, expect, it } from 'vitest'
import { wording } from '../../supabase/functions/_shared/wording'
import { configureNative, describeRun, health, isNative, notifications, SYNC_REACHED_SERVER } from './native'

// These tests run on the web, where there is no native side: every wrapper
// must answer quietly rather than call a plugin that isn't there.
describe('the native wrappers outside the native app', () => {
  it('knows it is not native', () => {
    expect(isNative()).toBe(false)
  })

  it('answer without a plugin', async () => {
    expect(await health.status()).toBeNull()
    expect(await health.requestPermission()).toBe(false)
    expect(await health.sync('health_open')).toBeNull()
    await expect(health.setToken('x')).resolves.toBeUndefined()
    await expect(health.clearToken()).resolves.toBeUndefined()
    await expect(configureNative('u1', {})).resolves.toBeUndefined()
    expect(await notifications.status()).toBeNull()
    expect(await notifications.request()).toBe(false)
    await expect(notifications.planFollowUp('2026-11-04')).resolves.toBeUndefined()
    await expect(notifications.cancelFollowUp('2026-11-04')).resolves.toBeUndefined()
  })
})

describe('describeRun', () => {
  const base = { trigger: 'health_open', at: '2026-11-04T08:00:00-05:00' }

  it('puts the wording module\'s words to a result the native side sent bare', () => {
    expect(describeRun({ ...base, result: 'done_today', message: '' }).message).toBe(wording.native.results.done_today)
    expect(describeRun({ ...base, result: 'failed', message: '' }).message).toBe(wording.native.results.failed)
  })

  it('keeps the server\'s own sentence when it sent one', () => {
    const run = describeRun({ ...base, result: 'night_complete', message: wording.sync.nightIn })
    expect(run.message).toBe(wording.sync.nightIn)
  })

  it('has words for every result the native side can return', () => {
    for (const result of ['no_token', 'no_url', 'no_permission', 'outside_window', 'done_today', 'busy', 'already_complete', 'night_complete', 'night_not_finished', 'unreadable', 'refused', 'failed']) {
      expect(wording.native.results[result as keyof typeof wording.native.results]).toBeTruthy()
    }
  })

  it('names the results after which the card may have changed', () => {
    expect([...SYNC_REACHED_SERVER].sort()).toEqual(['already_complete', 'night_complete', 'night_not_finished'])
  })
})
