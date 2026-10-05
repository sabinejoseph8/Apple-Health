# Consent text: draft for Sabine's review

**Status:** draft, 4 October 2026 (Phase 6, D79 and D80). Once Sabine approves it, these words move into the wording module (`wording.consent`) and become version 1. The consent screen shows them once, after a person's first sign-in and new password, before anything else. Written to meet the strictest of the rules where testers may live (Quebec's; see `docs/cayman-data-protection.md`, section 7). Square brackets mark what Sabine fills in.

---

## How Clarivi uses your data

**Who runs Clarivi**
Clarivi is a small four-week test run by [Sabine's full name] in the Cayman Islands. Sabine is in charge of protecting your information. Questions, requests or complaints: notions_close_5p@icloud.com.

**What Clarivi collects**
- From Apple Health, through the Clarivi Shortcut on your iPhone: heart rate, heart rate variability, breathing rate, resting heart rate and sleep, from your Apple Watch. The last 12 months once, then each morning.
- Your answers in the app: how you feel each morning, and whether you followed the day's suggestion.
- How you use the app: which screens you open, and when notifications arrive and are tapped. This log never holds your readings.
- Your email address, to sign you in.

**Why**
- To give you a status each morning and one suggestion for the day, based on your readings compared with your own normal.
- To find out, at the end of the test, whether Clarivi helps. Results are reported without names.

Clarivi is not a medical device and doesn't diagnose anything. For any health concern, talk to a doctor.

**Where it's kept**
Your data is stored and processed in the **United States**, by Supabase (a database service, on Amazon's servers in US East). The app itself is served by Vercel, also in the US, but your readings never pass through it. Data held in the US can be reached under US law, for example by US authorities with legal power to ask for it.

**Who can see it**
You, in the app. Sabine, who runs the test, can reach the database to run it and to help you. Nobody else. Your data is never sold or shared, and Clarivi has no ads or tracking.

**On your lock screen**
The morning notification shows your status and its reason on your lock screen. To hide it until you unlock, set notification previews to "When Unlocked" (the setup guide shows how).

**How long it's kept**
Until 90 days after the test ends, then it's deleted, unless you agree to something else.

**Your choices**
- See your readings and results in the app at any time, and ask Sabine for a copy of everything held about you.
- Delete my data, in Settings, removes all of it and keeps your account.
- Withdraw consent, in Settings, deletes everything and stops Clarivi collecting anything more. To use Clarivi again, you'd agree again.
- If you're unhappy with how your data is handled, tell Sabine, or contact the regulator where you live: the Office of the Ombudsman (Cayman Islands), the Commission d'accès à l'information (Quebec) or the Office of the Privacy Commissioner of Canada.

**Your agreement**
Both boxes start unticked, and "I agree" works only once both are ticked:
- [ ] I agree to Clarivi collecting and using my Apple Watch readings, my answers and my use of the app, as described above.
- [ ] I agree to my data being stored and processed in the United States.

**[ I agree ]**  ·  Sign out

Version 1, [date approved].

---

## Notes for Sabine

- **Your full name** goes in the first paragraph: the person in charge must be identifiable.
- **The two separate boxes** are deliberate: consent to the use, and separately to the US storage (Cayman's eighth principle and Quebec's rules), each confirmed in words, never ticked in advance.
- **Settings** will show "You agreed on [date]", with a link to read this text again, and the Withdraw consent row (D80).
- **"Sign out"** is a plain text link beside the button, so not agreeing is always possible and costs nothing.
- **This text is also the published privacy policy** Quebec asks for: the plan is to make it readable from the setup guide without signing in.
