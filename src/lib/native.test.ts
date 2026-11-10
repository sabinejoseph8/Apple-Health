import { describe, expect, it } from 'vitest'
import { wording } from '../../supabase/functions/_shared/wording'
import { type AppStateSource, configureNative, describeRun, health, isNative, notifications, SYNC_REACHED_SERVER, watchInFront } from './native'

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

// 10f: iOS also starts the native app out of sight when the Watch saves sleep,
// and the card must not count that as a view.
describe('watchInFront', () => {
  type Cb = (state: { inFront: boolean }) => void
  function fakeSource(answer: Promise<{ inFront: boolean }>) {
    let cb: Cb = () => undefined
    let removed = false
    const source: AppStateSource = {
      appState: () => answer,
      addListener: async (_event, f) => {
        cb = f
        return { remove: async () => void (removed = true) }
      },
    }
    return { source, send: (inFront: boolean) => cb({ inFront }), removed: () => removed }
  }
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it('counts the page as on screen outside the native app, as before', () => {
    const seen: boolean[] = []
    watchInFront((v) => seen.push(v))
    expect(seen).toEqual([true])
  })

  it('says out of sight when iOS started the app in the background', async () => {
    const seen: boolean[] = []
    const f = fakeSource(Promise.resolve({ inFront: false }))
    watchInFront((v) => seen.push(v), f.source)
    await settle()
    expect(seen).toEqual([false])
  })

  it('says on screen once the person opens the app, and away when they leave', async () => {
    const seen: boolean[] = []
    const f = fakeSource(Promise.resolve({ inFront: false }))
    watchInFront((v) => seen.push(v), f.source)
    await settle()
    f.send(true)
    f.send(false)
    expect(seen).toEqual([false, true, false])
  })

  it('lets an event that came first win over the slower first answer', async () => {
    const seen: boolean[] = []
    let answer: (v: { inFront: boolean }) => void = () => undefined
    const f = fakeSource(new Promise((r) => (answer = r)))
    watchInFront((v) => seen.push(v), f.source)
    await settle()
    f.send(true)
    answer({ inFront: false })
    await settle()
    expect(seen).toEqual([true])
  })

  it('counts the app as on screen if the native side cannot answer', async () => {
    const seen: boolean[] = []
    const f = fakeSource(Promise.reject(new Error('no such method')))
    watchInFront((v) => seen.push(v), f.source)
    await settle()
    expect(seen).toEqual([true])
  })

  it('stops calling back and removes its listener once stopped', async () => {
    const seen: boolean[] = []
    const f = fakeSource(Promise.resolve({ inFront: false }))
    const stop = watchInFront((v) => seen.push(v), f.source)
    stop()
    await settle()
    f.send(true)
    expect(seen).toEqual([])
    expect(f.removed()).toBe(true)
  })
})
