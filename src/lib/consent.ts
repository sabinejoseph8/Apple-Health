import { wording } from '../../supabase/functions/_shared/wording'
import { must, supabase } from './supabase'

// Consent (D79, D80): the text's version, which the database also knows
// (public.consent_version()); a newer text asks everyone again.
export const CONSENT_VERSION = wording.consent.version

export type Consent = { version: number; agreed_at: string } | null

// Sent when consent is withdrawn, so the app asks for it again.
export const CONSENT_CHANGED = 'clarivi:consent-changed'

// The agreement in force, if any. Row-level security means only the
// signed-in person's own.
export async function loadConsent(): Promise<Consent> {
  return must(await supabase.from('consents').select('version, agreed_at').is('ended_at', null).maybeSingle()) as Consent
}

export function consentCurrent(consent: Consent): boolean {
  return consent !== null && consent.version >= CONSENT_VERSION
}

// Both statements, as ticked on the consent screen.
export async function giveConsent(): Promise<void> {
  must(await supabase.rpc('give_consent', { p_version: CONSENT_VERSION, p_use: true, p_us_storage: true }))
}
