import { useEffect, useState } from 'react'
import { wording } from '../../supabase/functions/_shared/wording'
import { ChevronRightIcon } from '../components/Icons'
import { CONSENT_CHANGED, type Consent, loadConsent } from '../lib/consent'
import { go } from '../lib/route'
import { localDate, longDate } from '../lib/when'
import { PasswordConfirm } from './AccountSettings'

const w = wording.consent

// Settings: when the person agreed, the text they agreed to, and Withdraw
// consent (D79, D80). Withdrawing deletes everything; the app then asks for
// consent again.
export default function ConsentSettings() {
  const [consent, setConsent] = useState<Consent | undefined>(undefined)
  const [withdrawing, setWithdrawing] = useState(false)

  useEffect(() => {
    loadConsent()
      .then(setConsent)
      .catch(() => setConsent(null))
  }, [])

  if (withdrawing)
    return (
      <PasswordConfirm
        fn="account-withdraw-consent"
        title={w.withdraw}
        note={w.withdrawNote}
        working={w.withdrawing}
        onDone={() => window.dispatchEvent(new Event(CONSENT_CHANGED))}
        onCancel={() => setWithdrawing(false)}
      />
    )

  const agreed = consent ? new Date(consent.agreed_at) : null
  return (
    <section className="card" aria-labelledby="consent-h">
      <h2 id="consent-h" className="card-headline">
        {w.settingsTitle}
      </h2>
      {agreed && <p className="caption">{w.agreedOn(`${longDate(localDate(agreed))} ${agreed.getFullYear()}`)}</p>}
      <div className="settings-list">
        <a
          className="settings-row"
          href="#/privacy"
          onClick={(e) => {
            e.preventDefault()
            go('privacy')
          }}
        >
          <span>{w.read}</span>
          <ChevronRightIcon className="chevron" />
        </a>
        <button className="settings-row danger" type="button" onClick={() => setWithdrawing(true)}>
          <span>{w.withdraw}</span>
          <ChevronRightIcon className="chevron" />
        </button>
      </div>
    </section>
  )
}
