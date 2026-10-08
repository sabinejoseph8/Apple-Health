# Changelog

All notable changes to Clarivi. Releases are tagged in this repository (tech-spec, Deployment, step 7); during the test the score logic and settings are frozen.

## v1.0.0 (draft, not yet tagged)

The version the two-week test runs on (D89). To be tagged once Phase 6's code review is in and the score settings are frozen after Sabine's self-test.

### What Clarivi does

Each morning, Clarivi turns a person's own Apple Watch readings into a plain-words answer: what last night's readings mean against their own normal, why today's status was set, and one thing to do today.

### Getting readings in
- An iPhone Shortcut sends last night's heart rate, heart rate variability, breathing rate, resting heart rate and sleep, from two automations: unplugging the charger, and opening an everyday app. It stops once today's night is in.
- **Sync now** on the card runs it in one tap while last night isn't in yet, before noon.
- A one-time import of the last 12 months, in monthly parts that carry on after an interruption.
- Each person's upload token can only send readings, never read anything, and is replaced in Settings when needed.

### The morning answer
- A status, **Ready**, **Ease off** or **Rest**, from heart rate variability, sleeping heart rate and sleep, each compared with the person's own normal over recent nights; never Ready without enough data.
- A short briefing in plain words, with no numbers and no condition names, and one nudge: train as planned, train easy, prioritise sleep, or rest.
- A check-in ("How do you feel today?") before the status is shown, so the answer isn't shaped by it.
- Every situation has its own card: waiting for the sync, sleep still in progress, no sync yet, late, not enough data, learning your normal.
- **Why today**: each reading against its normal, with the numbers on tap, and how the status was decided.

### Notifications and follow-through
- A morning notification with the status and its reason; an 11:30 reminder when no sync has arrived; at 8pm on days the nudge asked for a change, "Did you follow today's nudge?". At most one of each a day, and the reminder and follow-up carry no health detail.
- Yes and No of equal weight, changeable until the next morning; an unanswered question comes first the next morning.

### Looking back
- **Trends**: 8 weeks of each reading, with its normal range as it was each night and the nights outside it marked.
- **A weekly digest** each Monday: what moved, what was flagged, how many days had data, how many nudges were followed.

### Your data and your account
- **Consent first**: before anything is collected, two separate agreements, to the use of the data and to its storage in the United States. **Withdraw consent** deletes everything and asks again.
- **"Your data"**: the consent text as a public page.
- Settings: notifications, the upload token, change password, sign out everywhere (which also stops notifications to every device), delete my data.

### For the owner
- An owner page: each person's last sync, reminder days, failed notifications and import progress, and how full the database is, with no health values.
- A command to give a tester a temporary password, and encrypted backups with a tested restore.

### Privacy and security
- Every table has row-level security, checked from the outside on the live project (119 of 119).
- A strict Content Security Policy: the app runs only its own code and talks only to itself and the database. No third-party scripts, analytics or tracking.
- Full-access keys only in Supabase; the repository's whole history checked for secrets.
- Data protection checked for the Cayman Islands, Ontario, Quebec and Washington, DC (not legal advice).

### Known limits
- Health data is locked while the iPhone is locked, so a sync needs the phone in use; Sync now covers mornings when the automations miss.
- Naps between noon and 6pm don't count toward the status (D83).
- A new person sees "Learning your normal" until 21 nights are tracked.
- Sessions don't time out after inactivity on the free plan; "Sign out everywhere" is there instead.
- Password checks in Settings share one sign-in rate limit with signing in.
- A phone that already has Clarivi keeps its old icon until the app is added to the Home Screen again.
