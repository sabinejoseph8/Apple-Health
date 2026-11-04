import { Capacitor, registerPlugin } from '@capacitor/core'

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
export type HealthResult =
  | 'no_token'
  | 'no_url'
  | 'outside_window'
  | 'done_today'
  | 'busy'
  | 'already_complete'
  | 'night_complete'
  | 'night_not_finished'
  | 'refused'
  | 'failed'
export interface HealthRun {
  result: HealthResult
  message: string
  trigger: string
  at: string
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
}

export type NotificationStatus = 'notDetermined' | 'denied' | 'authorized'

const plugin = registerPlugin<ClariviHealthPlugin>('ClariviHealth')

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
    return plugin.status()
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
    return plugin.sync({ trigger })
  },
}
