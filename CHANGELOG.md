# Changelog

All notable changes to Clarivi. Releases are tagged in this repository (tech-spec, Deployment, step 7); during the test the score logic and settings are frozen.

## v1.1.0 (29 October 2026)

Made after the one-week test, before the second week (D94 to D96).

- **A third way to start the morning sync:** when you stop your alarm. It first waited 10 minutes for your Watch to send the night; that wait was dropped on 30 October after its first real morning, so it tries straight away and the other two catch up.
- **A better 11:30 reminder (30 October):** it now also goes when today's status isn't in yet because last night isn't finished, not only when nothing has synced. New words: "Today's status isn't in yet. Open Clarivi and tap Sync now before noon to get today's nudge."
- **A sleep floor in the score (version 3):** a night of sleep far below your usual (1.5 or more spreads) can't be Ready: it is Ease off, and the card, the notification and Why today say sleep set it. Older versions are untouched.
- **AI explanations:** Claude Opus 5.5 writes the morning explanation and the weekly digest from your readings, sent without your name, email or dates. The score still sets the status. The card waits for the text ("Getting ready"), a tested filter checks every text, and the fixed wording shows if the AI is slow or refused. A second check reads each digest's claims against the data.
- **Consent version 3:** a third box for the AI, required. Everyone agrees again.
- **Consent version 4:** the AI paragraph now says the weekly digest also sends how you said you felt each day and whether you followed each suggestion. Everyone agrees again once.
- **Fixed on the way:** a test that failed from 29 October on, and a digest that read "no answer" on Ready days as "not followed".

## v1.0.0

The version the one-week test runs on (D89, D91), 19 to 25 October 2026. Tagged once Phase 6's code review was in and the score settings were frozen after Sabine's self-test.

### What Clarivi does

Each morning, Clarivi turns a person's own Apple Watch readings into a plain-words answer: what last night's readings mean against their own usual levels, why today's status was set, and one thing to do today.

### Getting readings in
- An iPhone Shortcut sends last night's heart rate, heart rate variability, breathing rate, resting heart rate and sleep, from two automations: unplugging the charger, and opening an everyday app. It stops once today's night is in.
- **Sync now** on the card runs it in one tap while last night isn't in yet, before noon.
- A one-time import of the last 12 months, in monthly parts that carry on after an interruption.
- Each person's upload token can only send readings, never read anything, and is replaced in Settings when needed.

### The morning answer
- A status, **Ready**, **Ease off** or **Rest**, from heart rate variability, sleeping heart rate and sleep, each compared with the person's own usual levels over recent nights; never Ready without enough data.
- A short briefing in plain words, with no numbers and no condition names, and one nudge: train as planned, train easy, prioritise sleep, or rest.
- A check-in ("How do you feel today?") before the status is shown, so the answer isn't shaped by it.
- Every situation has its own card: waiting for the sync, sleep still in progress, no sync yet, late, not enough data, learning your usual levels, and no sleep stages.
- **Nights without sleep stages count** (D92): when the Watch records only total time asleep, the night is built from that, with a note on the card and Why today saying so.
- **Why today**: each reading against its usual range, with the numbers on tap, and how the status was decided.
- **Previous days** (D88): any past day opens as Why today for that date, with Previous day and Next day to step through.

### Notifications and follow-through
- A morning notification with the status and its reason; an 11:30 reminder when no sync has arrived; at 8pm on days the nudge asked for a change, "Did you follow today's nudge?". At most one of each a day, and the reminder and follow-up carry no health detail.
- Yes and No of equal weight, changeable until the next morning; an unanswered question comes first the next morning.

### Looking back
- **Trends**: 8 weeks of each reading, with its usual range as it was each night and the nights outside it marked.
- **A weekly digest** each Monday: what moved, what was flagged, how many days had data, how many nudges were followed.

### Your data and your account
- A session ends after 30 days without use (D90, on the Supabase Pro plan, with daily backups).
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
- A new person sees "Learning your usual levels" until 21 nights are tracked.
- Sleep records carry no source, so a night with no stages counts only when the Watch's heart rate was recorded through it; an app that writes sleep with stages can't be told from the Watch (D92).
- Password checks in Settings share one sign-in rate limit with signing in.
- A phone that already has Clarivi keeps its old icon until the app is added to the Home Screen again.
