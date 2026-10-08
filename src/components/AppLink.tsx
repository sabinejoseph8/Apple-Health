import type { ReactNode } from 'react'
import { go, goDay, type Route } from '../lib/route'

// A link to another screen of the app. It carries the screen's real address,
// and a tap moves there through go() (or goDay() for a past day, D88), so
// Back knows the screen was opened from inside the app.
export default function AppLink({
  to,
  className,
  children,
}: {
  to: Exclude<Route, 'today' | 'day'> | { day: string }
  className?: string
  children: ReactNode
}) {
  const href = typeof to === 'string' ? `#/${to}` : `#/day/${to.day}`
  return (
    <a
      className={className}
      href={href}
      onClick={(e) => {
        e.preventDefault()
        if (typeof to === 'string') go(to)
        else goDay(to.day)
      }}
    >
      {children}
    </a>
  )
}
