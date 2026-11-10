import { Capacitor, registerPlugin } from '@capacitor/core'
import { wording } from '../../supabase/functions/_shared/wording'

// Whether the app is running inside the native iPhone app (D115, Phase 10)
// rather than in Safari or the Home Screen web app. The native app has no
// service worker or web push, and syncs Health itself instead of running the
// Shortcut, so the web-only parts switch off when this is true.
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

// The native Health sync (10b): the Swift side is ios/App/App/HealthSync.
// Results and messages never hold a reading.
export type HealthTrigger = 'health_open' | 'health_button'
export type HealthResult = keyof typeof wording.native.results
export interface HealthRun {
  result: HealthResult
  // The server's own sentence when it sent one, else the words for the result.
  message: string
  trigger: string
  at: string
}

// The results that mean the server was reached and the card may have changed.
export const SYNC_REACHED_SERVER: ReadonlySet<string> = new Set(['already_complete', 'night_complete', 'night_not_finished'])

// The native side sends a result code and, at most, the server's sentence;
// every other sentence comes from the wording module (R61, CLAUDE.md).
export function describeRun(run: HealthRun): HealthRun {
  const message = run.message || wording.native.results[run.result] || wording.general.offline
  return { ...run, message }
}
export interface HealthStatus {
  available: boolean
  hasToken: boolean
  permissionAsked: boolean
  lastRun: HealthRun | null
}

interface ClariviHealthPlugin {
  status(): Promise<HealthStatus>
  requestPermission(): Promise<{ asked: boolean }>
  setToken(options: { token: string }): Promise<void>
  clearToken(): Promise<void>
  sync(options: { trigger: HealthTrigger }): Promise<HealthRun>
  configure(options: Record<string, string>): Promise<void>
  notificationStatus(): Promise<{ status: NotificationStatus }>
  requestNotifications(): Promise<{ granted: boolean }>
  planFollowUp(options: { date: string }): Promise<void>
  cancelFollowUp(options: { date: string }): Promise<void>
  appState(): Promise<{ inFront: boolean }>
  addListener(event: 'appState', cb: (state: { inFront: boolean }) => void): Promise<{ remove: () => Promise<void> }>
}

export type NotificationStatus = 'notDetermined' | 'denied' | 'authorized'

const plugin = registerPlugin<ClariviHealthPlugin>('ClariviHealth')

// Whether the person can see the app (10f). iOS also starts the native app
// out of sight when the Watch saves sleep, and the card then loads with no one
// looking; such a load must not count as a view, or record a status as shown.
// The source is the native plugin; tests pass their own.
export interface AppStateSource {
  appState(): Promise<{ inFront: boolean }>
  addListener(event: 'appState', cb: (state: { inFront: boolean }) => void): Promise<{ remove: () => Promise<void> }>
}

// Calls back with whether the app is on screen now, then each time that
// changes. Outside the native app the page counts as on screen, as before. If
// the native side can't answer, the app counts as on screen, as before 10f.
export function watchInFront(cb: (inFront: boolean) => void, source: AppStateSource | null = isNative() ? plugin : null): () => void {
  if (!source) {
    cb(true)
    return () => undefined
  }
  let live = true
  let heard = false
  const listener = source.addListener('appState', (state) => {
    heard = true
    if (live) cb(state.inFront)
  }).catch(() => null)
  source
    .appState()
    .then((state) => state.inFront)
    .catch(() => true)
    .then((inFront) => {
      // An event that arrived first is newer than this answer.
      if (live && !heard) cb(inFront)
    })
  return () => {
    live = false
    listener.then((l) => l?.remove()).catch(() => undefined)
  }
}

// On each open, the native side learns the server address, the signed-in
// account (its token is the only one used) and the words for its
// notifications (10c), all from here so the wording stays in one module.
export async function configureNative(userId: string, texts: Record<string, string>): Promise<void> {
  if (!isNative()) return
  await plugin.configure({ ingestUrl, userId, ...texts })
}

// The notifications the native app schedules on the phone itself (10c).
export const notifications = {
  async status(): Promise<NotificationStatus | null> {
    if (!isNative()) return null
    return (await plugin.notificationStatus()).status
  },
  async request(): Promise<boolean> {
    if (!isNative()) return false
    return (await plugin.requestNotifications()).granted
  },
  async planFollowUp(date: string) {
    if (!isNative()) return
    await plugin.planFollowUp({ date }).catch(() => undefined)
  },
  async cancelFollowUp(date: string) {
    if (!isNative()) return
    await plugin.cancelFollowUp({ date }).catch(() => undefined)
  },
}

// The same server the web build was made for; the native side keeps it with the token.
const ingestUrl = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/ingest`

// Every call does nothing outside the native app.
export const health = {
  async status(): Promise<HealthStatus | null> {
    if (!isNative()) return null
    const s = await plugin.status()
    return { ...s, lastRun: s.lastRun ? describeRun(s.lastRun) : null }
  },
  async requestPermission(): Promise<boolean> {
    if (!isNative()) return false
    return (await plugin.requestPermission()).asked
  },
  async setToken(token: string): Promise<void> {
    if (!isNative()) return
    await plugin.setToken({ token })
  },
  // Sign out and Delete my data: this phone forgets the token (R23).
  async clearToken(): Promise<void> {
    if (!isNative()) return
    try {
      await plugin.clearToken()
    } catch {
      // Nothing to clear.
    }
  },
  async sync(trigger: HealthTrigger): Promise<HealthRun | null> {
    if (!isNative()) return null
    return describeRun(await plugin.sync({ trigger }))
  },
}
