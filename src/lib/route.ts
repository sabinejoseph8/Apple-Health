import { useEffect, useState } from 'react'

// The screens, kept in the address after "#" so the phone's back gesture and
// a notification's link can reach them: "#/why", "#/settings". The setup
// guide ("#/guide") and "Your data" ("#/privacy") also open without signing in.
// A past day is "#/day/2026-10-06" (D88).
export type Route = 'today' | 'why' | 'settings' | 'trends' | 'digest' | 'owner' | 'guide' | 'privacy' | 'day'

const ROUTES: Route[] = ['why', 'settings', 'trends', 'digest', 'owner', 'guide', 'privacy']

const DAY = /^day\/(\d{4}-\d{2}-\d{2})$/

export function routeFrom(hash: string): Route {
  const name = hash.replace(/^#\/?/, '')
  if (DAY.test(name)) return 'day'
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'today'
}

// The date of a past day's address, "2026-10-06", or null.
export function dayFrom(hash: string): string | null {
  return hash.replace(/^#\/?/, '').match(DAY)?.[1] ?? null
}

// True while the current screen was opened from inside the app, so Back can
// return through history; a screen opened from a link goes to the card.
let openedInApp = false

// The whole address is kept, so moving from one past day to another
// (the route stays "day") still shows the new day.
export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => {
      const next = routeFrom(window.location.hash)
      if (next === 'today') openedInApp = false
      setHash(window.location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return routeFrom(hash)
}

export function go(route: Route): void {
  openedInApp = route !== 'today'
  window.location.hash = route === 'today' ? '/' : `/${route}`
}

// A past day (D88). Stepping from one day to the next replaces the address,
// so Back still returns to the screen the days were opened from.
export function goDay(date: string, replace = false): void {
  openedInApp = true
  if (replace) window.location.replace(`#/day/${date}`)
  else window.location.hash = `/day/${date}`
}

// Back to the card: through the phone's history when the card opened this
// screen, so the back gesture and the Back button agree.
export function back(): void {
  if (openedInApp) window.history.back()
  else go('today')
}
