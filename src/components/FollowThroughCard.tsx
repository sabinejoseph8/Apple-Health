import { useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import type { FollowAnswer } from '../lib/follow'
import { BellIcon, DashCircleIcon, TickCircleIcon } from './Icons'

const w = wording.followThrough

// "Did you follow it?" with Yes and No of equal size and weight (R53), then
// "Recorded: ..." with Change until the answer can no longer change (R54).
// The design's 8pm card: a Link blue ring, a bell and "Today's nudge".
export default function FollowThroughCard({
  label,
  action,
  answer,
  hint,
  onAnswer,
}: {
  label: string
  action: string
  answer: FollowAnswer | null
  hint: string
  onAnswer: (answer: FollowAnswer) => Promise<void>
}) {
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function choose(a: FollowAnswer) {
    setBusy(true)
    setFailed(false)
    try {
      await onAnswer(a)
      setChanging(false)
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  const asking = answer === null || changing
  return (
    <section className="card follow-through" aria-labelledby="follow-label">
      <p id="follow-label" className="eyebrow follow-label">
        <BellIcon />
        {label}
      </p>
      <p className="card-headline">{action}</p>
      {asking ? (
        <>
          <p className="follow-question">{w.question}</p>
          <div className="follow-answers" role="group" aria-labelledby="follow-label">
            <button className="answer" type="button" disabled={busy} onClick={() => choose('yes')}>
              {w.yes}
            </button>
            <button className="answer" type="button" disabled={busy} onClick={() => choose('no')}>
              {w.no}
            </button>
          </div>
          {failed && (
            <p className="form-error" role="alert">
              {w.failed}
            </p>
          )}
          <p className="caption">{hint}</p>
        </>
      ) : (
        <div className="follow-recorded">
          <p className={answer === 'yes' ? 'recorded recorded-yes' : 'recorded'}>
            {answer === 'yes' ? <TickCircleIcon /> : <DashCircleIcon />}
            {answer === 'yes' ? w.followed : w.notFollowed}
          </p>
          <button className="row-action" type="button" onClick={() => setChanging(true)}>
            {w.change}
          </button>
        </div>
      )}
    </section>
  )
}
