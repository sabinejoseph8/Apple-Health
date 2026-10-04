import { supabase } from './supabase'

export type PushSupport = 'ready' | 'not-installed' | 'not-supported' | 'blocked'

// iOS only allows web push for apps opened from the Home Screen.
export function pushSupport(env: {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  standalone: boolean
  isIOS: boolean
  permission: NotificationPermission | 'unavailable'
}): PushSupport {
  if (env.isIOS && !env.standalone) return 'not-installed'
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'not-supported'
  if (env.permission === 'denied') return 'blocked'
  return 'ready'
}

export function currentPushSupport(): PushSupport {
  const nav = navigator as Navigator & { standalone?: boolean }
  return pushSupport({
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    standalone: nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
    isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    permission: 'Notification' in window ? Notification.permission : 'unavailable',
  })
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function saveSubscription(sub: PushSubscription) {
  const keys = sub.toJSON().keys ?? {}
  const { error } = await supabase.rpc('register_push', {
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh ?? '',
    p_auth: keys.auth ?? '',
  })
  if (error) throw error
}

// Must be called from a tap: iOS only shows the permission prompt then (R47).
export async function turnOnNotifications(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('permission ' + permission)
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY as string),
    }))
  await saveSubscription(sub)
}

// Re-registers this device each time the app opens, so a renewed
// subscription is never missed. Returns whether this device is subscribed.
export async function refreshSubscription(): Promise<boolean> {
  if (currentPushSupport() !== 'ready' || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return false
  await saveSubscription(sub)
  return true
}

// Stops this device getting notifications before signing out, so a signed-out
// person's status never appears on this phone's lock screen (R23). The
// server stops sending once the push service reports the subscription gone.
export async function forgetThisDevice(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  await sub?.unsubscribe()
}

export async function sendTestNotification(delaySeconds: number): Promise<void> {
  const { error } = await supabase.functions.invoke('send-push', {
    body: { kind: 'test', delay_seconds: delaySeconds },
  })
  if (error) throw error
}
