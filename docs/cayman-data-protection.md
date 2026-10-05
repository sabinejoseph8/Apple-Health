# Cayman Islands data protection: what it means for Clarivi

**Status:** research summary, 4 October 2026 (Phase 6). **This is not legal advice.** It reads the Data Protection Act (2021 Revision) and the Ombudsman's guidance against how Clarivi works, so Sabine can decide what to do and whether to ask someone qualified to review it.

---

## 1. Does the Act apply?

Most likely, yes.
- The Act applies to a data controller "established in the Islands", and an individual "ordinarily resident in the Islands" counts as established (section 6). If Sabine lives in Cayman, as the project assumes, and decides why and how the testers' data is used, she is the data controller.
- The exemption for "personal, family or household affairs" (section 26) covers Sabine's own data, not other people's data held for a test.
- The research exemption (section 23) only helps where data are "not processed to support a measure or decision with respect to a particular data subject". Clarivi gives each person a daily status and nudge, so it doesn't fit, and it would not remove the need for consent anyway.

## 2. Watch readings are sensitive personal data

"Sensitive personal data" includes a person's "physical or mental health or condition" and "medical data" (section 3). Heart rate, heart rate variability and sleep describe physical condition, so the safe reading is that all of Clarivi's readings, statuses and check-ins are sensitive.

Processing sensitive data needs one of the conditions in Schedule 3. The one that fits Clarivi is the first: "The data subject has given consent to the processing" (Schedule 3, paragraph 1). The Ombudsman's guidance asks for **explicit** consent for this kind of data, "expressly confirmed in words, rather than by any other positive action".

## 3. Is a recorded tap on "I agree" enough? (D79)

It can be, if the screen and the button are built for it.
- **What the Act asks:** consent is a "freely given, specific, informed and unambiguous indication" of the person's wishes, given "by a statement or by a clear affirmative action" (section 2).
- **What the Ombudsman's guidance asks:**
  - a positive opt-in, with no pre-ticked boxes or defaults
  - a request that is prominent, separate from other terms, short and easy to understand
  - the controller's name, why the data is wanted and what will be done with it
  - a record of "who, when, how, and what you told people"
  - withdrawal made easy, at any time
- **What D79 already does:** a separate screen with the full text, shown before anything else; an active tap; a record of who agreed, the text's version and the time; the text in the wording module.
- **What it still needs, to count as explicit consent:**
  - The words on the screen and button must state the agreement itself, for example "I agree to Clarivi using my health data as described above", not just "OK" or "Continue".
  - A separate sentence agreeing to storage in the US (section 4 below).
  - A clear way to withdraw (section 6).
- **Who has to prove it:** the controller "shall bear the burden of proving the data subject's consent" (Schedule 5, paragraph 1). D79's stored record (who, which text, when) is that proof.
- **When consent doesn't count:** "Where there is a significant imbalance between the position of the data subject and the data controller, consent shall not provide a legal basis" (Schedule 5, paragraph 4). If a tester works for Sabine or depends on her in a similar way, their consent may not count. Worth checking when choosing testers.

## 4. Storing the data in the US

- The eighth principle bars transfers to a country without "an adequate level of protection". The Ombudsman treats the EEA and countries with an EU adequacy decision as adequate; the **United States is not on that list**.
- Schedule 4 lists transfers the principle doesn't apply to. The first is: "The data subject has consented to the transfer." So the consent text must say plainly that the data is stored and processed in the United States (Supabase, on Amazon's servers in US East), and the person must agree to that too.
- Supabase's data processing terms include standard contractual clauses, written for EU law. That is a useful extra safeguard, though not one the Ombudsman has approved for Cayman.

## 5. Other duties that apply

| Duty | Where in the Act | Clarivi |
|---|---|---|
| Tell people who the controller is and what the data is for | Schedule 1, Part 2, paragraph 2 | The consent text names Sabine and the purpose |
| Collect only what's needed | Third principle | Only the Watch readings the score uses, plus check-ins and usage counts |
| Don't keep data longer than needed | Fifth principle | Deleted 90 days after the test ends unless the person agrees otherwise (tech-spec, Default); "Delete my data" at any time |
| Keep data secure | Seventh principle | Row-level security, encryption at rest, the Content Security Policy, encrypted backups (Phase 6, step 1) |
| A written contract with any service that processes the data | Schedule 1, Part 2, paragraph 3 | Supabase's Data Processing Addendum "supplements and forms part of" its terms for every customer: it acts "under the instructions of Customer" and keeps "appropriate technical and organizational" security measures. Vercel's addendum is part of its terms too; health data never passes through Vercel |
| Report a data breach to the people affected and the Ombudsman within 5 days | Section 16 (fine up to $100,000) | To add to the runbook in the tech spec |
| Answer a request to see one's data within 30 days | Section 8(6) | Sabine answers from the owner tools; Delete my data covers erasure |

The Act sets no registration or fee for data controllers (none found in the text).

## 6. What this suggests for the build (for Sabine to decide)

1. **Consent screen wording:** an explicit "I agree" statement in words, a separate sentence agreeing to US storage, and the controller (Sabine) and purposes named. The text is drafted in the wording module for Sabine's review.
2. **Withdrawing consent:** the text should say how to withdraw. Simplest: "Delete my data" in Settings removes everything, and telling Sabine closes the account. Or a "Withdraw consent" row in Settings that leads there. Either way, nothing more is collected afterwards.
3. **The breach duty:** add the 5-day notice to the runbook.
4. **Choosing testers:** avoid anyone who depends on Sabine, such as an employee.
5. **Vercel's free plan:** its terms let Vercel use "Your Content" (code and data stored with it) to train AI and share it with third parties. Clarivi's health data never goes through Vercel; the phone and the app talk to Supabase directly. So this touches only the app's code, which is public anyway, and the Supabase integration's copies of the secret key and database password in Vercel's settings (accepted on 2 October 2026; the app never reads them). Taking those copies out of Vercel would close that gap, if the integration allows it.
6. **Optionally,** ask someone qualified in Cayman data protection to read the consent text before testers sign up.

## Sources

- [Data Protection Act (2021 Revision), Office of the Ombudsman](https://ombudsman.ky/images/pdf/laws_regs/Data_Protection_Act_2021_Rev.pdf): sections 2, 3, 6, 8, 16, 23 and 26; Schedules 1, 3, 4 and 5.
- [Ombudsman guidance: consent](https://ombudsman.ky/data-protection-organisation/legal-basis-for-processing/consent)
- [Ombudsman guidance: eighth principle, international transfers](https://ombudsman.ky/data-protection-organisation/data-protection-principles/eighth-data-protection-principle-international-transfers)
- [Supabase Data Processing Addendum](https://supabase.com/legal/customer-resources/data-processing-addendum)
- [Vercel Terms of Service](https://vercel.com/legal/terms)
