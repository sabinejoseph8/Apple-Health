import { Capacitor } from '@capacitor/core'

// Whether the app is running inside the native iPhone app (D115, Phase 10)
// rather than in Safari or the Home Screen web app. The native app has no
// service worker or web push, and syncs Health itself instead of running the
// Shortcut, so the web-only parts switch off when this is true.
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}
