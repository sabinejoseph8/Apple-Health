# Privacy impact assessment: storing testers' data in the United States

**Status:** approved by Sabine on 4 October 2026. Written for Quebec's rule that personal information may leave Quebec only after an assessment of how it will be protected (Act respecting the protection of personal information in the private sector, section 17, as amended by Law 25), and useful for every tester (`docs/cayman-data-protection.md`). Not legal advice. Review again before any change in where the data goes, or before Clarivi is offered more widely.

## 1. What is sent, and why

- **Data:** each tester's Apple Watch readings (heart rate, heart rate variability, breathing rate, resting heart rate, sleep), the results Clarivi works out from them (nights, normals, daily status and nudge), their answers (morning check-in, follow-through), a usage log without readings, notification records, their email address and a password fingerprint.
- **Sensitivity:** high. It describes physical condition, and is treated as sensitive health information everywhere testers live.
- **Purpose:** to give each tester a morning status and one suggestion, and to evaluate the four-week test. Nothing else.
- **Volume:** four people, at most about a year of readings each (Sabine's year is about 130,000 rows).

## 2. Where it goes

| Recipient | Where | What it holds | Role |
|---|---|---|---|
| Supabase | Amazon Web Services, US East (`us-east-1`) | Everything above | Data processor: stores and processes it on Sabine's instructions |
| Vercel | United States | The app's code only; no readings pass through it | Hosts the web app |
| Apple | Testers' own iPhones and Apple's push service | Notification text: status and reason in the morning only | The testers' own devices and accounts |

Sabine's encrypted backups stay on her Mac, outside iCloud (D77).

## 3. The legal setting in the United States

- The US has no general federal privacy law covering this data, and no law in force in Washington, DC for health data held outside health care (a bill is in committee). HIPAA does not apply to Clarivi.
- US authorities can, under US law, require service providers to hand over data they hold, in some cases without the person being told.
- Supabase's terms commit it to process data only on the customer's instructions, keep security measures, use listed sub-processors with notice of changes, and include standard contractual clauses for international transfers.

## 4. Protections

- **Consent first:** nothing is collected before a tester agrees, separately, to the use of their data and to its storage in the US (D79); withdrawing deletes everything (D80).
- **Only what's needed:** only the readings the score uses; no names beyond an email address; the usage log holds no readings.
- **Access:** row-level security on every table, so each person reaches only their own rows; checked from the outside on the live project (110 of 110 checks); only Sabine can reach the database directly.
- **Encryption:** in transit (HTTPS everywhere) and at rest (on every Supabase plan); backups in an AES-256 encrypted disk image.
- **The app:** a strict Content Security Policy; no third-party scripts, analytics or tracking.
- **Keys:** full-access keys kept only in Supabase (D81, done 5 October 2026: Vercel's copies removed, the secret key replaced, the old signing secret revoked).
- **Retention:** deleted 90 days after the test, unless a tester agrees otherwise; "Delete my data" and "Withdraw consent" at any time.
- **Incidents:** a breach plan that tells the people affected and the regulators within 5 days (`docs/cayman-data-protection.md`, section 7).

## 5. Risks and what reduces them

| Risk | Likelihood | Effect | What reduces it |
|---|---|---|---|
| A US authority requires the data | Very low (a small test of no public interest) | High for the person | Consent names it; little data; deleted after the test |
| A breach at Supabase | Low | High | Supabase's security programme and contract; encryption; Sabine's incident plan |
| A mistake in Clarivi exposes one person's data to another | Low | High | Row-level security on every table, tested on every change and on the live project |
| A full-access key leaks | Low | High | Keys only in Supabase (D81); the repository is scanned on every build |
| Data kept too long | Low | Medium | The 90-day rule, recorded in the plan |

## 6. Conclusion

Given the small scale, the testers' informed and separate consent to US storage, the processor's contract and the technical protections above, storing testers' data with Supabase in the United States is proportionate for the four-week test. The written agreement with the processor is Supabase's Data Processing Addendum, read together with this assessment.

Assessed by Sabine Joseph, person in charge of protecting personal information, 4 October 2026.

---

## 7. Addendum, 29 October 2026 (D94): AI explanations through Anthropic

**Status:** drafted for Sabine's confirmation; applies to everyone, because agreeing to the AI is required to use Clarivi (R68, Sabine, 29 October 2026). A consent that is a condition of use is acceptable for a one-person test; for other testers under Quebec or Ontario rules it should be separate and optional, so revisit before they return.

- **What is sent:** only what `docs/ai-draft.md` lists: the status and nudge, the three readings with the person's usual range and points, a few yes-or-no flags, and for the weekly digest the last 7 days and weekly totals for 8 weeks. Never a name, email address, user id, token, calendar date, time zone, location, raw samples, workouts or notes.
- **Recipient:** Anthropic, an AI service provider acting as the data processor (its published commercial terms treat the customer as controller). Processing location not confirmed; the consent says "the United States or other countries where Anthropic operates". A written data processing agreement was not confirmed on the pages read; to check before more people use the AI.
- **What Anthropic does with it:** by default does not train its models on API inputs or outputs; keeps them up to 30 days (Sonnet and Opus 5.5 are not among the "Covered Models" that require a 30-day hold, but the older retention article gives 30 days); may keep a flagged request up to 2 years and safety scores up to 7 years; does not delete API data on request. So "Delete my data" and "Withdraw consent" cannot remove it; the consent says so.
- **Risks and what reduces them:** a provider breach (little data, no identity, short retention, a provider security programme); the AI wording a condition or advice (a tested filter and a fixed fallback, R73); the person did not realise (a separate, optional, unticked box and plain wording); a key leaks (kept only in Supabase's secrets, spending capped).
- **Conclusion:** proportionate for a one-person test with the safeguards above. Still to do before other testers use the AI: confirm the processing location and the agreement with Anthropic.

Update, 29 October 2026 (D98): the weekly digest also sends, for each day, the person's check-in answer (great, okay or off) and whether they followed the day's suggestion. These are answers about how they felt, not readings, and are sent without names or dates like the rest. The consent text (version 4) now says so.
