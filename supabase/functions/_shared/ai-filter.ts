// The filter every AI text passes before anyone sees it (R73, D95). Ordinary
// code with tests: it never asks a model. It returns the ids of the checks
// that failed (docs/ai-eval/README.md); an empty list means the text may be
// shown. A text that fails is tried once more, then the fixed wording shows.

import type { AiInput, DigestInput, MorningInput } from './ai-input.ts'

export type { AiInput } from './ai-input.ts'
export interface MorningOutput {
  explanation: string
}
export interface DigestOutput {
  sentences: string
  patterns: string[]
}

// No condition, diagnosis or symptom (R61), including the words the fixed
// wording only uses inside "no early sign of illness or heavy strain".
const CONDITIONS: RegExp[] = [
  /\bcovid/i, /\bflu\b/i, /\binfluenza/i, /\binfect/i, /\bfever/i, /\bvirus/i, /\bviral/i, /\bdisease/i, /\bdiagnos/i,
  /\bsick/i, /\bill\b/i, /\billness/i, /\bunwell/i, /\bdisorder/i, /\bsyndrome/i, /\bovertrain/i, /\barrhythmia/i,
  /\batrial/i, /\bfibrillation/i, /\bafib/i, /\bapn?oea/i, /\bapnea/i, /\binsomnia/i, /\bhypertension/i, /\btachycardia/i,
  /\bbradycardia/i, /\bdepress/i, /\banxi/i, /\bburnout/i, /\bburn out/i, /\bcold\b/i, /\bpain/i, /\bheadache/i,
  /\bnausea/i, /\bdehydrat/i, /\bpregnan/i, /\bcancer/i, /\bdiabet/i, /\bstroke/i, /\bheart attack/i, /\bcardiac/i,
  /\bconcussion/i, /\bpanic/i, /\bmental health/i, /\bsymptom/i, /\bchronic/i, /\binjur/i, /\bstress/i,
  // Added in the 7b-7 review: a condition named without one of the words above.
  /\bheart (problem|condition|issue|trouble|disease)/i, /\bhealth (problem|issue|concern|condition)/i, /\bcondition\b/i,
  /\bunhealthy\b/i, /\bfatigue/i, /\binflammat/i, /\basthma/i, /\bmigraine/i, /\bblood pressure/i, /\bsore throat/i,
  /\bailment/i, /\bunder the weather\b/i, /\bfighting (something|off)\b/i, /\bcoming down with\b/i, /\brun[- ]down\b/i,
]

// No medical, medication or supplement advice, and no "see a doctor".
const ADVICE: RegExp[] = [
  /\bdoctor/i, /\bphysician/i, /\bclinician/i, /\bnurse/i, /\bGP\b/, /\bmedic(al|ation|ine)/i, /\bprescri/i, /\bsupplement/i,
  /\bvitamin/i, /\bmagnesium/i, /\bmelatonin/i, /\bcaffeine/i, /\balcohol/i, /\btherap/i, /\btreat/i, /\bhospital/i,
  /\bemergenc/i, /\bseek (help|advice|care)/i, /\bconsult/i, /\bspecialist/i, /\bpill/i,
  // Added in the 7b-7 review: "see a doctor" and diet advice in other words.
  /\bprofessional/i, /\bhealth ?care/i, /\bchecked (out|over)\b/i, /\bchecked by\b/i, /\bsee (someone|somebody)\b/i,
  /\bhydrat/i, /\bdrink/i, /\bdiet\b/i, /\bnutrition/i,
]

// What may not be said about a status, and about a nudge.
const AGAINST_STATUS: Record<string, RegExp[]> = {
  ready: [/\bease off\b/i, /\bnot ready\b/i, /\b(rest|recovery) (day|today)\b/i, /\bneeds? (to )?(rest|recover)/i, /\btake a rest\b/i],
  // "Ready" as a status is refused, except when it is negated ("not fully ready").
  ease_off: [/(?<!n't |not |fully |yet )\bready\b/i, /\bgood to go\b/i, /\bfull speed\b/i, /\b(status|readiness) is rest\b/i],
  rest: [/(?<!n't |not |fully |yet )\bready\b/i, /\bgood to go\b/i, /\bease off\b/i, /\bas planned\b/i, /\btrain (hard|normally)\b/i, /\bpush (hard|yourself)\b/i, /\bgo for it\b/i],
}
const AGAINST_NUDGE: Record<string, RegExp[]> = {
  train_as_planned: [/\b(take it|go) (a little |a bit |much )?(easy|easier)\b/i, /\beasier\b/i, /\blighter\b/i, /\bskip\b/i, /\brest (day|today)\b/i, /\bcut back\b/i, /\bscale back\b/i, /\bdial (it )?back\b/i],
  train_easy: [/\b(full|complete|whole) (rest|day off)/i, /\brest day\b/i, /\btake the day off\b/i, /\bdon'?t train\b/i, /\bno (training|exercise|workout)\b/i, /\bskip (your |the )?(workout|training|session)\b/i],
  prioritise_sleep: [/\bpush (hard|yourself)\b/i, /\bfull rest day\b/i, /\btrain hard\b/i],
  rest: [/\btrain (hard|as planned|normally|easy)\b/i, /\bgo for it\b/i, /\bpush (hard|yourself)\b/i, /\beasy (run|session|workout)\b/i, /\blight session\b/i],
}

// A morning text may not guess why the night was as it was (the instruction says so, and the
// input holds nothing that could show a cause). "Because your Watch did not record..." is a fact
// from the input, so only the causal words that point at the person's doings are refused.
const GUESSED_CAUSE: RegExp = /\bbecause (you|of)\b|\bdue to\b|\bcaused?\b|\bthanks to\b|\bresult of\b|\blikely (from|due|because)\b|\bprobably (from|due|because)\b|\bdown to\b|\bfrom (a|an|the|your) (late|hard|heavy|long|big|tough|busy)\b|\b(after|from) (your )?(training|workout|run|dinner|meal|coffee|drinks?)\b/i
const SELF: RegExp = /\b(AI|A\.I\.|artificial intelligence|language model|Claude|Anthropic|chatbot|assistant)\b/i
const CAUSAL: RegExp = /\bbecause\b|\bcaused?\b|\bdue to\b|\bleads? to\b|\bled to\b|\bresult(s|ed)? (in|from)\b|\bthanks to\b|\bas a result\b|\bexplains?\b|\bwhy\b|\bso that\b/i
const TREND: RegExp = /\btrend|\bheading\b|\bgetting (better|worse)\b|\bimprov|\bdecline|\bdownhill|\bdownward|\bupward|\bclimbing\b|\bdropping\b|\brising\b|\bslipping\b/i
const BLAME: RegExp = /\byou should(n't| not)?\b|\btrust the app\b|\bignore (how|what|your)\b|\bfailed\b|\bneglect|\bshould have\b|\byou must\b|\bneed to\b|\bignored\b|\bbetter to\b/i
const FLOOR_SAYS: RegExp = /(far|much) (less|shorter)|very short|far below|short(er)? night|far too little|barely slept/i
const TWO_OF_THREE: RegExp = /\btwo of (your |the )?three\b|\btwo (of the |of your )?(three )?readings\b|\bonly two\b|\bbased on two\b/i
const NUMBER_WORDS: RegExp = /\b(four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|percent)\b/i
// An amount in other words ("about an hour shorter"): the texts say "much shorter", never how much.
const AMOUNT_UNITS: RegExp = /\b(hours?|minutes?|mins?|bpm|beats|milliseconds?)\b|\bhalf an hour\b/i
// The morning text names the plan, it doesn't give orders beyond the nudge (docs/ai-draft.md, section 3).
const DIRECTIVE: RegExp = /\byou (need to|have to|must|should|ought to)\b|\bmake sure (you|to)\b|\bdon'?t forget\b/i

const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean).length

function plainText(text: string): boolean {
  return !(
    /[*_`#\[\]<>|\\]/.test(text) ||
    /[–—]/.test(text) ||
    / - /.test(text) ||
    /^\s*[-•*]\s/m.test(text) ||
    /\n/.test(text) ||
    /\p{Extended_Pictographic}/u.test(text) ||
    /https?:\/\//i.test(text)
  )
}

function checkWords(text: string, status: string | null, nudge: string | null, fails: Set<string>) {
  if (CONDITIONS.some((r) => r.test(text))) fails.add('no_condition_words')
  if (ADVICE.some((r) => r.test(text))) fails.add('no_medical_advice')
  if (SELF.test(text)) fails.add('no_self_reference')
  if (!plainText(text)) fails.add('plain_text')
  if (status && (AGAINST_STATUS[status] ?? []).some((r) => r.test(text))) fails.add('status_agrees')
  if (nudge && (AGAINST_NUDGE[nudge] ?? []).some((r) => r.test(text))) fails.add('nudge_agrees')
}

function checkMorning(input: MorningInput, out: MorningOutput): string[] {
  const fails = new Set<string>()
  const text = typeof out?.explanation === 'string' ? out.explanation.trim() : ''
  if (text === '') return ['length_ok']
  checkWords(text, input.status, input.nudge, fails)
  if (/\d/.test(text) || NUMBER_WORDS.test(text) || AMOUNT_UNITS.test(text)) fails.add('no_new_numbers')
  if (DIRECTIVE.test(text)) fails.add('no_blame')
  if (GUESSED_CAUSE.test(text)) fails.add('no_causal_claim')
  if (sentencesOf(text).length > 3 || wordsOf(text) > 60) fails.add('length_ok')
  if (input.flags.sleep_floor && !(/sleep/i.test(text) && FLOOR_SAYS.test(text))) fails.add('credits_sleep_floor')
  if (input.readings_used === 2 && !TWO_OF_THREE.test(text)) fails.add('says_two_of_three')
  return [...fails]
}

function checkDigest(input: DigestInput, out: DigestOutput): string[] {
  const fails = new Set<string>()
  const sentences = typeof out?.sentences === 'string' ? out.sentences.trim() : ''
  const patterns = Array.isArray(out?.patterns) ? out.patterns.map((p) => (typeof p === 'string' ? p.trim() : '')) : []
  if (sentences === '') return ['length_ok']
  const all = [sentences, ...patterns].join(' ')
  checkWords(all, null, null, fails)
  // Patterns may be listed, so the list rules apply to the sentences only.
  if (!plainText(sentences) || patterns.some((p) => !plainText(p))) fails.add('plain_text')

  // Words only (Sabine, 29 October 2026): the digest holds no digits at all.
  if (/\d/.test(all) || AMOUNT_UNITS.test(all)) fails.add('no_new_numbers')
  if (sentencesOf(sentences).length > 6 || wordsOf(sentences) > 140) fails.add('length_ok')
  if (patterns.length > 3 || patterns.some((p) => p === '' || wordsOf(p) > 25)) fails.add('length_ok')
  if (CAUSAL.test(all)) fails.add('no_causal_claim')
  if (BLAME.test(all)) fails.add('no_blame')

  const withData = input.days.filter((d) => d.status !== 'none').length
  if ((withData < 5 || input.prior_weeks.length === 0) && (TREND.test(all) || patterns.length > 0)) fails.add('no_trend_from_thin_data')
  return [...fails]
}

// The failing check ids; empty when the text may be shown.
export function checkOutput(input: AiInput, out: MorningOutput | DigestOutput): string[] {
  return input.kind === 'morning' ? checkMorning(input, out as MorningOutput) : checkDigest(input, out as DigestOutput)
}
