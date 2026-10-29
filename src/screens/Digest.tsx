import { useEffect, useState } from 'react'
import { type DigestFacts, digestWords } from '../../supabase/functions/_shared/digest'
import { wording } from '../../supabase/functions/_shared/wording'
import { Loading, LoadFailed } from '../components/LoadState'
import NavBar from '../components/NavBar'
import { must, supabase } from '../lib/supabase'
import { logUsage } from '../lib/today'
import { dateLine, localDate, longDate, nextDigestDay } from '../lib/when'

const d = wording.digest

// The weekly digest (R57, R58): the latest week, written from its facts.
// Before the first one, when it will appear.
export default function Digest() {
  const [facts, setFacts] = useState<DigestFacts | null | undefined>(undefined)
  // The AI's sentences and patterns for this week, once written (R71).
  const [ai, setAi] = useState<{ sentences: string; patterns: string[] } | null>(null)
  const [failed, setFailed] = useState(false)

  async function load() {
    try {
      const row = must(await supabase.from('digests').select('facts').order('week_start', { ascending: false }).limit(1).maybeSingle()) as {
        facts: DigestFacts
      } | null
      setFacts(row?.facts ?? null)
      if (row?.facts) {
        const t = await supabase.from('ai_texts').select('body').eq('kind', 'digest').eq('for_date', row.facts.week_start).maybeSingle()
        const body = t.error ? null : (t.data?.body as { sentences?: unknown; patterns?: unknown } | null)
        setAi(
          body && typeof body.sentences === 'string' && body.sentences.trim() !== ''
            ? { sentences: body.sentences, patterns: Array.isArray(body.patterns) ? body.patterns.filter((p): p is string => typeof p === 'string' && p.trim() !== '') : [] }
            : null,
        )
      }
      setFailed(false)
      logUsage('digest_open', { date: localDate(new Date()) })
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const words = facts ? digestWords(facts) : null
  return (
    <main className="page digest">
      <NavBar title={d.row} />
      {facts === undefined && !failed && <Loading />}
      {facts === undefined && failed && <LoadFailed onRetry={load} />}
      {facts === null && (
        <section className="card">
          <p className="body">{d.firstOn(dateLine(nextDigestDay(new Date())))}</p>
        </section>
      )}
      {facts && words && (
        <>
          <section className="card summary" aria-labelledby="digest-title">
            <p className="eyebrow">{d.rangeShort(longDate(facts.week_start), longDate(facts.week_end))}</p>
            <h2 id="digest-title" className="summary-title">
              {d.title}
            </h2>
            <p className="body">{words.nights}</p>
          </section>
          {ai && (
            <section className="card" aria-labelledby="digest-ai">
              <h3 id="digest-ai" className="card-title">
                {d.aiHeading}
              </h3>
              <p className="body">{ai.sentences}</p>
            </section>
          )}
          {ai && ai.patterns.length > 0 && (
            <section className="card" aria-labelledby="digest-patterns">
              <h3 id="digest-patterns" className="card-title">
                {d.patternsHeading}
              </h3>
              <ul className="consent-list">
                {ai.patterns.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          )}
          {!ai && (
          <>
          <section className="card" aria-labelledby="digest-status">
            <h3 id="digest-status" className="card-title">
              {d.statusHeading}
            </h3>
            {words.status.map((line) => (
              <p key={line} className="body">
                {line}
              </p>
            ))}
          </section>
          <section className="card" aria-labelledby="digest-readings">
            <h3 id="digest-readings" className="card-title">
              {d.readingsHeading}
            </h3>
            {words.readings.map((line) => (
              <p key={line} className="body">
                {line}
              </p>
            ))}
          </section>
          <section className="card" aria-labelledby="digest-nudges">
            <h3 id="digest-nudges" className="card-title">
              {d.nudgesHeading}
            </h3>
            <p className="body">{words.nudges}</p>
          </section>
          </>
          )}
        </>
      )}
    </main>
  )
}
