// The built page inside the native iPhone app (D115, Phase 10).
//
// Vite marks the script and stylesheet tags it writes into index.html with
// `crossorigin`. The native app serves the same files from its own origin,
// capacitor://localhost, where WebKit refuses a crossorigin load of them: on
// the iOS Simulator (iOS 27, 4 November 2026) neither the script nor the
// stylesheet loaded and the app stayed a white screen. The files are always
// same-origin, on the web too, so the attribute does nothing there and the
// build leaves it off everywhere.
export function stripCrossorigin(html: string): string {
  return html.replace(/<(script|link)\b([^>]*?)\s+crossorigin(?:="[^"]*")?(?=[\s>])/g, '<$1$2')
}
