import { wording } from '../../supabase/functions/_shared/wording'
import { back } from '../lib/route'
import { ChevronLeftIcon } from './Icons'

// "< Today" (or another label) on the left and the screen's title in the middle.
export default function NavBar({ title, backLabel = wording.why.back }: { title: string; backLabel?: string }) {
  return (
    <header className="nav-bar">
      <button className="nav-back" type="button" onClick={back}>
        <ChevronLeftIcon />
        {backLabel}
      </button>
      <h1 className="nav-title">{title}</h1>
      <span aria-hidden="true" />
    </header>
  )
}
