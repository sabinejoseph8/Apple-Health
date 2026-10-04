import { wording } from '../../supabase/functions/_shared/wording'
import NavBar from '../components/NavBar'

// Why today (R35 to R43): built in Phase 3, step 3.
export default function WhyToday() {
  return (
    <main className="page">
      <NavBar title={wording.card.why.ease_off} />
    </main>
  )
}
