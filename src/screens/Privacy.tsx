import { wording } from '../../supabase/functions/_shared/wording'
import ConsentText from '../components/ConsentText'
import NavBar from '../components/NavBar'

const w = wording.consent

// The consent text as Clarivi's published privacy policy (Quebec asks for
// one): public, opening without signing in, from the setup guide and from
// Settings.
export default function Privacy() {
  return (
    <main className="page">
      <NavBar title={w.pageTitle} backLabel={wording.guide.back} />
      <h2 className="card-headline">{w.title}</h2>
      <ConsentText />
      <p className="footnote">{w.versionLine}</p>
    </main>
  )
}
