import { wording } from '../../supabase/functions/_shared/wording'
import NavBar from '../components/NavBar'
import { SHORTCUT_URL } from '../lib/links'
import AppLink from '../components/AppLink'

const w = wording.guide

// The one-page setup guide (Phase 6, D78; R10, R62). Public: it opens before
// signing in, from the sign-in screen, from Settings or from a link. It holds
// instructions only, never anyone's data.
export default function Guide() {
  return (
    <main className="page guide">
      <NavBar title={w.title} backLabel={w.back} />
      <p className="body">{w.intro}</p>
      {w.sections.map((section, i) => (
        <section key={section.title} className="card" aria-labelledby={`guide-${i}`}>
          <h2 id={`guide-${i}`} className="card-headline">
            {i + 1}. {section.title}
          </h2>
          <ol className="guide-steps">
            {'withAddress' in section && <li>{w.address(window.location.host)}</li>}
            {section.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {'withPrivacyLink' in section && (
            <AppLink className="text-link" to="privacy">
              {wording.consent.guideLink}
            </AppLink>
          )}
          {'withShortcutLink' in section && (
            <a className="primary button-link" href={SHORTCUT_URL} target="_blank" rel="noopener noreferrer">
              {wording.uploadToken.getShortcut}
            </a>
          )}
        </section>
      ))}
      <p className="footnote">{w.contact}</p>
    </main>
  )
}
