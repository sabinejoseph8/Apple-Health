import { useEffect, useState } from 'react'

// The screens, kept in the address after "#" so the phone's back gesture and
// a notification's link can reach them: "#/why", "#/settings". The setup
// guide ("#/guide") and "Your data" ("#/privacy") also open without signing in.
export type Route = 'today' | 'why' | 'settings' | 'trends' | 'digest' | 'owner' | 'guide' | 'privacy'

const ROUTES: Route[] = ['why', 'settings', 'trends', 'digest', 'owner', 'guide', 'privacy']

export function routeFrom(hash: string): Route {
  const name = hash.replace(/^#\/?/, '')
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'today'
}

// True while the current screen was opened from inside the app, so Back can
// return through history; a screen opened from a link goes to the card.
let openedInApp = false

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFrom(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      const next = routeFrom(window.location.hash)
      if (next === 'today') openedInApp = false
      setRoute(next)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function go(route: Route): void {
  openedInApp = route !== 'today'
  window.location.hash = route === 'today' ? '/' : `/${route}`
}

// Back to the card: through the phone's history when the card opened this
// screen, so the back gesture and the Back button agree.
export function back(): void {
  if (openedInApp) window.history.back()
  else go('today')
}
