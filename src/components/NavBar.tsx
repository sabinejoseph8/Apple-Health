import { wording } from '../../supabase/functions/_shared/wording'
import { back } from '../lib/route'
import { ChevronLeftIcon } from './Icons'

// "< Today" on the left and the screen's title in the middle.
export default function NavBar({ title }: { title: string }) {
  return (
    <header className="nav-bar">
      <button className="nav-back" type="button" onClick={back}>
        <ChevronLeftIcon />
        {wording.why.back}
      </button>
      <h1 className="nav-title">{title}</h1>
      <span aria-hidden="true" />
    </header>
  )
}
