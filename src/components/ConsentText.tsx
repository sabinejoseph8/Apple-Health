import { wording } from '../../supabase/functions/_shared/wording'

const w = wording.consent

// The consent text's sections (D79), shared by the consent screen and the
// public "Your data" page.
export default function ConsentText() {
  return (
    <>
      {w.sections.map((section, i) => (
        <section key={section.title} className="card" aria-labelledby={`consent-${i}`}>
          <h2 id={`consent-${i}`} className="section-headline">
            {section.title}
          </h2>
          {'bullets' in section && (
            <ul className="consent-list">
              {section.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {'paragraphs' in section &&
            section.paragraphs.map((p) => (
              <p key={p} className="body">
                {p}
              </p>
            ))}
        </section>
      ))}
    </>
  )
}
