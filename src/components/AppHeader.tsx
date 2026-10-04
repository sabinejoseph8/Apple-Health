import { wording } from '../../supabase/functions/_shared/wording'
import { go } from '../lib/route'
import { dateLine, greeting } from '../lib/when'
import { GearIcon } from './Icons'

// The top of the card: the date, a greeting and the Settings button (R20).
export default function AppHeader({ now }: { now: Date }) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">{dateLine(now)}</p>
        <h1 className="large-title">{greeting(now)}</h1>
      </div>
      <button className="icon-button" type="button" aria-label={wording.day.settings} onClick={() => go('settings')}>
        <GearIcon />
      </button>
    </header>
  )
}
