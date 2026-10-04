// R61: no screen or notification names a medical condition or suggests a
// diagnosis. The illness check's agreed words ("no early sign of illness or
// heavy strain", R33) describe a pattern, not a condition, so "illness" itself
// is allowed. Used by the wording tests.
export const FORBIDDEN_TERMS: RegExp[] = [
  /\bcovid/, /\bflu\b/, /\binfluenza/, /\binfection/, /\bfever/, /\bvirus/, /\bviral/, /\bdisease/, /\bdiagnos/,
  /\bsick/, /\bdisorder/, /\bsyndrome/, /\bovertrain/, /\barrhythmia/, /\batrial/, /\bfibrillation/, /\bafib/,
  /\bapnoea/, /\bapnea/, /\binsomnia/, /\bhypertension/, /\btachycardia/, /\bbradycardia/, /\bdepress/, /\banxiety/,
  /\bburnout/, /\bcold\b/,
]
