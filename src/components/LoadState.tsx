import { wording } from '../../supabase/functions/_shared/wording'

// While a screen loads, and when it couldn't: "Couldn't load …" with Try again.
export function Loading() {
  return <section className="card loading" aria-busy="true" />
}

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="card">
      <p className="body">{wording.card.loadFailed}</p>
      <button className="text-button" type="button" onClick={onRetry}>
        {wording.card.retry}
      </button>
    </section>
  )
}
