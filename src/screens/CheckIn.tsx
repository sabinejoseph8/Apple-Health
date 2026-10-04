import { useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import type { CheckinAnswer } from '../lib/today'

const w = wording.checkin
const ANSWERS: CheckinAnswer[] = ['good', 'okay', 'off']

// "How do you feel today?" with three equal answers (R16). On the first open
// of the day it comes before the status and can be skipped (R17); opened
// again from the card, it changes the answer (R18) and can be cancelled.
export default function CheckIn({
  mode,
  onAnswer,
  onSkip,
  onCancel,
}: {
  mode: 'first' | 'later'
  onAnswer: (answer: CheckinAnswer) => Promise<void>
  onSkip: () => void
  onCancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function choose(answer: CheckinAnswer) {
    setBusy(true)
    setFailed(false)
    try {
      await onAnswer(answer)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <section className="card checkin" aria-labelledby="checkin-question">
      <h2 id="checkin-question" className="card-headline">
        {w.question}
      </h2>
      <div className="answers" role="group" aria-labelledby="checkin-question">
        {ANSWERS.map((a) => (
          <button key={a} className="answer" type="button" disabled={busy} onClick={() => choose(a)}>
            {w.answers[a]}
          </button>
        ))}
      </div>
      <p className="caption">{w.hint}</p>
      {failed && (
        <p className="form-error" role="alert">
          {w.failed}
        </p>
      )}
      <button className="text-button" type="button" disabled={busy} onClick={mode === 'first' ? onSkip : onCancel}>
        {mode === 'first' ? w.skip : w.cancel}
      </button>
    </section>
  )
}
