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
