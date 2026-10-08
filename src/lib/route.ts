import { useEffect, useState } from 'react'

// The screens, kept in the address after "#" so the phone's back gesture and
// a notification's link can reach them: "#/why", "#/settings". The setup
// guide ("#/guide") and "Your data" ("#/privacy") also open without signing in.
// A past day is "#/day/2026-10-06" (D88).
export type Route = 'today' | 'why' | 'settings' | 'trends' | 'digest' | 'owner' | 'guide' | 'privacy' | 'day'

const ROUTES: Route[] = ['why', 'settings', 'trends', 'digest', 'owner', 'guide', 'privacy']

const DAY = /^day\/(\d{4}-\d{2}-\d{2})$/

export function routeFrom(hash: string): Route {
  if (dayFrom(hash)) return 'day'
  const name = hash.replace(/^#\/?/, '')
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'today'
}

// The date of a past day's address, "2026-10-06", or null, also for a date
// that doesn't exist, such as 31 February.
export function dayFrom(hash: string): string | null {
  const date = hash.replace(/^#\/?/, '').match(DAY)?.[1]
  if (!date) return null
  const d = new Date(`${date}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date ? date : null
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
// so Back still returns to the screen the days were opened from (or to the
// card, when the days were opened from a link).
export function goDay(date: string, replace = false): void {
  if (replace) return window.location.replace(`#/day/${date}`)
  openedInApp = true
  window.location.hash = `/day/${date}`
}

// Back to the card: through the phone's history when the card opened this
// screen, so the back gesture and the Back button agree.
export function back(): void {
  if (openedInApp) window.history.back()
  else go('today')
}
