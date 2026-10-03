# Progress: Clarivi

**Status of this plan:** Agreed, v1.0 (30 September 2026)
**Last updated:** 3 October 2026 (Phase 1b in progress: upload path live, Shortcut on Sabine's iPhone, decisions D42 and D43)
**Builds on:** product-spec.md (Agreed, v1.0), tech-spec.md (Agreed, v1.0), design.md (Agreed, v1.0)

---

## Summary

- **Current phase:** Phase 1, Spikes (In progress)
- **Overall status:** Phase 1a done (3 October 2026). Phase 1b in progress (3 October 2026): the upload path is live (tokens, the `ingest` function, readings tables), the Upload token section is on the home screen, and the Clarivi Sync Shortcut is installed on Sabine's iPhone and reaches the live server. The first spike runs on her phone changed the post format to columns (D42) and moved the 6pm-to-noon heart-rate window to the server (D43). Work is on branch `phase-1b-daily-sync`, merged to `main` for each release.
- **Next action:** Collect about a week of mornings on Sabine's iPhone for the checks (the first one confirms a complete night, the sleep stages on the server and the "synced today" file); get the dates of a past trip for the time-zone check; fix the missing sleep source and make an unrecognised trigger word harmless.
- **Where ticks live:** in both places: this file (`- [x]`) and the Clarivi Memory site (https://claude.ai/artifact/5Aw5x3PYAro7pDXQRkapTe).
- **Code reviews:** every phase ends with a code review of everything it changed (added 3 October 2026 at Sabine's request). Phase 1's review covers 1a, 1b and 1c together. The Clarivi Memory site shows these review tasks too.
- **Recent changes in 1b:** new tables `upload_tokens`, `uploads` and `samples`; database functions `ingest_upload` and `issue_upload_token`; server functions `ingest` and `account-token`; the Upload token section; the Shortcut generator `scripts/shortcut/build_shortcut.py` and the "Clarivi Check" diagnostic; Deno tests (`npm run test:functions`), Shortcut checks (Python) and a local sync check (`npm run check:local:sync`), all on every push except the local check.
- **Recent changes since 1a:** Playwright end-to-end tests run in WebKit at iPhone size on every push (`npm run test:e2e`; the first tests cover the sign-in screen); `interview-notes.md` keeps Sabine's first-person PM story and is updated after significant features, bug fixes and design changes; a Playwright MCP server is set up in Claude Code for this folder (from the next session).
- **Known issues:** the app icon is a placeholder and needs replacing before testers install the app; the home screen is a temporary stand-in until the readiness card (Phase 3).

**Set-up so far (checked 3 October 2026)**
| Item | State |
|---|---|
| Supabase project | "Clarivi" (ref `vuynnnrijdbvamwfauog`), free plan, created 2 October 2026 in US East (`us-east-1`). Live since 3 October 2026: `profiles` and `push_subscriptions` (row-level security on), `register_push`, the `account-first-login` and `send-push` functions, the live notification keys in the secret store, and two accounts (Sabine as owner, and the test account), both past their first password change. The project also has Supabase's automatic row-level security for new tables (`rls_auto_enable`), chosen at creation |
| GitHub repository | `sabinejoseph8/Apple-Health`, public; Phase 1a merged into `main` on 3 October 2026; GitHub Actions run the app, secret and database checks on every push |
| Vercel | Project `clarivi` (Hobby) under `sabine5`, deploying from GitHub: production from `main` at https://clarivi-zeta.vercel.app, a preview for every other branch. Connected to Supabase through the official integration (Production values); preview values and the push public key added by hand (3 October 2026) |

**Settled: Supabase region (2 October 2026).** The first project was created in US West by mistake. It was replaced while still empty by a new project in US East (ref `vuynnnrijdbvamwfauog`), as the plan said. The old US West project (ref `pupxkjhhhgeeoqyvtsst`) is no longer used.

| Phase | Name | Status |
|---|---|---|
| 1 | Spikes: the riskiest unknowns first | In progress |
| 2 | Data and analysis | Not started |
| 3 | Readiness card, check-in and Why today | Not started |
| 4 | Notifications and follow-through | Not started |
| 5 | Trends, digest, settings and owner page | Not started |
| 6 | Hardening and dry run | Not started |
| 7 | Four-week test | Not started |
| 8 | Results and demo | Not started |

Requirement numbers (R1 to R67) refer to product-spec.md.

---

## Phase 1: Spikes (the riskiest unknowns first)

**Goal:** prove the four things that could force a change of approach before building anything else:
- the iPhone app and push work
- the Shortcut can sync
- a year can be imported
- users' data stays separate

**Status:** In progress (1a done on 3 October 2026; 1b next)

### 1a. App, sign-in and push
- [x] Create the GitHub repository with GitHub Actions
- [x] Set up the local copy of Supabase (needs Docker) for building and tests
- [x] Create the one Supabase project (free plan, US East); switch off new sign-ups; set the 12-character password minimum
- [x] Create a Vite + React + TypeScript app with a web app manifest and a service worker
- [x] Deploy to Vercel (Hobby) with a production address and preview addresses
- [x] Create the owner account and a test account in the dashboard, marked as confirmed (no email)
- [x] Build sign-in and the forced "Set a new password" screen on first login
- [x] Create two sample tables with row-level security, and a CI check that fails if any table lacks it
- [x] Generate push signing keys; build `register_push` and a `send-push` function using `@negrel/webpush` (fall back to `npm:web-push` if it fails)
- [x] Add the app to the home screen on your iPhone, allow notifications, send a test push and tap it

### 1b. Daily sync
- [x] Build the `ingest` function: upload token check (hash only), schema check, duplicate-proof storage, reply flags (`night_complete`, `already_complete_today`)
- [x] Build token creation (shown once) and revocation
- [ ] Build the Shortcut template: ping first, then read and post readings; save "synced today" to iCloud Drive when the night is complete
- [ ] Set up both automations (charger unplugged; chosen app opened) on your phone (the tester's phone moved to the Phase 6 dry run, D44)
- [ ] **Check:** do Watch sleep stages arrive, or only "asleep"?
- [ ] **Check:** how often does the unplug run fail because the phone is locked?
- [ ] **Check:** do readings from a past trip keep their recorded time zone?

### 1c. One-year import
- [ ] Add monthly import to the Shortcut (12 parts, resumable)
- [ ] Time a full import on your phone and a tester's; measure the size of one month's post
- [ ] Interrupt an import on purpose and confirm it continues from the last finished month
- [ ] Count the nights in your year with at least one HRV reading inside the sleep window

### End of Phase 1
- [ ] Code review of everything changed in Phase 1 (1a to 1c); fix what it finds, then re-run the Phase 1 automated tests

### Automated tests
- Row-level security: a test user can't read or write another user's rows in any table.
- Upload path: one user's token can't write rows for another user, and no token can read data.
- Ingest: posting the same readings twice stores them once; an unknown type or out-of-range value is rejected.
- The CI check fails when a table without row-level security is added.

### Manual verification
1. **Install and sign in:** add the app to the home screen and sign in with the temporary password.
   *Expected:* it opens full screen, asks for a new password once, then lands on the home screen.
2. **Push:** send a test push with the app closed, then tap it.
   *Expected:* it arrives on the lock screen, and tapping opens the app already signed in.
3. **Isolation:** sign in as the test account.
   *Expected:* none of the owner's data appears.
4. **Daily sync:** unplug your phone in the morning, then open your chosen app.
   *Expected:* readings arrive once. A second run stops after the ping, and no duplicates appear.
5. **Import:** run the full import.
   *Expected:* 12 months arrive, and an interrupted run resumes without duplicates.
6. **Spike notes:** record every check's result (sleep stages, locked-phone rate, time zones, import time, post size, HRV coverage).
   *Expected:* any result that breaks a rule triggers its fallback from the tech spec before Phase 2 starts.

### Spike results
**1a. App, sign-in and push (3 October 2026)**
- Manual checks 1 to 3 passed on Sabine's iPhone: the app installs and opens full screen; the temporary password forces "Set a new password" once, then lands on home with the Owner tag; the test account sees only itself.
- Push works end to end. `@negrel/webpush` 0.5.0 runs in Supabase's function runtime and Apple's push service (`web.push.apple.com`) accepts it, so the `npm:web-push` fallback isn't needed. The test notification arrived about 15 seconds after tapping (the built-in delay), and tapping it opened the app still signed in.
- Saving a new password ends every existing session, so the app signs straight back in with the new password.
- A phone belongs to whoever signed in on it last: signing in as another account moves that phone's notifications to it.
- Supabase trap: switching off email sign-ups under the Email provider also switches off email sign-in. New sign-ups are blocked by the general "Allow new users to sign up" switch instead.
- Vercel's Supabase integration fills in Production only; the Preview values were added by hand.
- Automated checks: database tests (row-level security on every table, cross-user reads and writes), app tests, the build secret check, and a local end-to-end run (`npm run check:local`) all pass on every push. The upload-path and ingest tests come with 1b.

**1b. Daily sync (in progress, 3 October 2026)**
- The upload path is live: tokens are created with a password check and shown once, reissuing stops the old token at once, and the live `ingest` function turns away unknown tokens and posts without one. Supabase's security advisor shows no new warnings.
- Apple's `shortcuts sign` tool signs a generated Shortcut on the Mac, so the Shortcut installs with a tap (AirDrop). The signature carries the signer's Apple account email, so signed files stay in `private/` and sharing with testers needs a decision.
- All five Health types import with the right names (Heart Rate, Heart Rate Variability, Respiratory Rate, Resting Heart Rate, Sleep).
- **Sleep stages (check 1):** the Watch's stages come through by name (Core, Deep, REM, Awake), not only "asleep" (seen on Sabine's iPhone with Clarivi Check; to confirm on the server after the first full morning sync).
- **Health searches only work in whole days.** "Start Date is after" a time finds nothing; "between" two times and "in the last N hours" widen to whole days; "in the last 1 day" means yesterday and today. A date-only text ("2026-10-03") is read as noon. Fallback taken: fetch whole days, apply the heart-rate window on the server (D43).
- **One line per reading is far too slow.** 1,063 heart-rate readings took 14 minutes 28 seconds; joining each column as a list took 1.3 seconds. Fallback taken: send columns (D42). This also makes the 1c import practical.
- iOS blocks a Shortcut from sending more than a small number of Health items until Settings, Apps, Shortcuts, Advanced, "Allow Sharing Large Amounts of Data" is turned on (1,138 items were refused). Sabine turned it on; it goes in the setup guide.
- With it on, the first full post stored 305 readings: 237 heart rate (12 to 15 an hour across 6pm to noon; about 830 from noon to 6pm were set aside, as D43 intends), 13 HRV, 39 breathing rate, 1 resting heart rate and 15 sleep stages (awake, core, deep, REM).
- Known issue: sleep readings arrived without their source name; the other types have it. To fix before Phase 2, which uses the source to keep Watch readings only (D10).
- Both automations are set up on Sabine's iPhone (iOS 27's new editor: the trigger is the first block of the automation). The tester-phone part moved to the Phase 6 dry run (D44, 3 October 2026).
- Still to measure: the locked-phone rate (check 2), past time zones (check 3), and the "already synced" file on real mornings.

---

## Phase 2: Data and analysis

**Goal:** turn raw readings into correct nights, baselines, a daily status and a nudge. Prove them against an independent check, and set the score numbers.

**Status:** Not started

### Tasks
- [ ] Build `nights`: sleep window from Watch sleep stages, local wake date, finished flag, sleeping heart rate (median while asleep), HRV median and count, breathing rate, yesterday's resting heart rate, coverage and confidence
- [ ] Build `baselines`: 28-night median and scaled spread, excluding the night judged; 21-valid-night minimum; normal range
- [ ] Build `daily_status`:
  - points per reading, total and zones
  - a missing reading's weight moved to the other two
  - no status with two or more missing
  - "Learning your normal"
  - never Ready without enough data
- [ ] Build the illness check and nudge selection from the four actions; write results to `insights`
- [ ] Build `analysis_queue` and the every-minute scheduler; imports recompute once at the end and never notify
- [ ] Build `score_settings` (versioned) with the starting numbers: HRV 40%, sleeping heart rate 35%, sleep 25%; Ease off from 1, Rest from 2
- [ ] Load your events (illness, major events) from your calendar; detect travel days (or take them from the calendar if time zones were lost in Phase 1)
- [ ] Import your workout summaries for the Signal check
- [ ] Write the pandas reference notebook and compare it with the SQL stage by stage on your year
- [ ] Measure on your year: the disrupted-day match, how often Ease off or Rest fire, and how often each reading is missing
- [ ] Set the final score numbers, decide the HRV minimum and the ease-off cap, then record them
- [ ] Start the two-to-three-week self-test: read your own status each morning before the screens exist
- [ ] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests

### Automated tests
- Night dating: a known night is assigned the right date, including across a time-zone change.
- Baseline: a fixed 28-night example gives the expected median, range and 21-night rule.
- Missing reading: with HRV missing, the weights move as expected (for example, the sample day totals 1.19, Ease off).
- Learning your normal: with two readings building, the status is none, never Ready.
- Recompute: running the analysis twice gives identical results.

### Manual verification
1. **Reference check:** run the pandas notebook on your year.
   *Expected:* every stage matches the SQL exactly (or within rounding).
2. **Sample day:** look at Tuesday 29 September in `daily_status`.
   *Expected:* sleeping heart rate 51, normal 50; total about 1.6; Ease off.
3. **Signal on your year:** look at your disrupted days.
   *Expected:* at least 2 in 3 are Ease off or Rest, and Ease off and Rest together fire on no more than about 1 day in 7. If not, adjust the numbers before freezing.
4. **No-push imports:** check the outbox after an import.
   *Expected:* no notifications were queued.

---

## Phase 3: Readiness card, check-in and Why today

**Goal:** build the screens testers use every morning, matching design.md and handling every state.

**Status:** Not started

### Tasks
- [ ] Add design tokens (colours, type, spacing, radius) from design.md as CSS variables
- [ ] Build the wording module: briefing parts, verdicts, nudges, state messages and notification text, with rule tests
- [ ] Build the daily check-in screen (good, okay, off, Skip) and the check-in row on the card
- [ ] Build the readiness card:
  - header, status pill, briefing card, nudge block, Why link and digest row
  - the morning layout
  - every no-status and partial state (R25 to R34)
- [ ] Build Why today:
  - summary card, three reading cards with mini charts and "Show the numbers"
  - "Also checked"
  - "How today's status is decided" with the points table and zone boxes
  - missing and building states
- [ ] Log card views and Why today opens
- [ ] Check safe areas and the one-screen fit on 390-point iPhones
- [ ] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests

### Automated tests
- Wording rules: no condition names; no numbers in briefings; at most three sentences.
- State selection: each data situation (waiting, unfinished, partial, not enough, learning, late, no sync) picks the right card state.
- End to end (iPhone screen size): the sample day renders Ease off with the expected headline, and Why today shows the three readings with their numbers on tap.
- Fit: the morning card fits within 390 by 763 points without scrolling.

### Manual verification
1. **Check-in:** open the app for the first time today.
   *Expected:* the check-in appears before the status; Skip shows the card with a prompt.
2. **Card:** read the card on your iPhone.
   *Expected:* it matches the design screens: status, briefing, nudge and sync time, with no scrolling.
3. **Why today:** tap "Why ease off today".
   *Expected:* the title follows the status, each reading shows its explainer, value, normal and verdict, and the numbers open and close.
4. **States:** sign in as the test account with made-up data for a missing reading, then for a building baseline.
   *Expected:* "Based on 2 of 3 readings", then "Learning your normal", never Ready.

---

## Phase 4: Notifications and follow-through

**Goal:** deliver the morning nudge, the 11:30 reminder and the 8pm follow-up, and record whether nudges were followed.

**Status:** Not started

### Tasks
- [ ] Build the notification outbox, with one notification of each kind per user per day
- [ ] Queue the morning notification after analysis (status and reason; none on days without a status)
- [ ] Build `plan_notifications()` every 5 minutes: 11:30 reminders and 8pm follow-ups by each user's local time
- [ ] Build the sender schedule and delivery, failure and tap logging
- [ ] Build the 8pm card state: follow-through card with equal Yes and No, folded briefing, recorded states with Change
- [ ] Build next-morning carry-over for unanswered questions
- [ ] Show notification health on the card and in Settings
- [ ] Add the late-sync marking (11:30 to noon) and the no-sync-by-noon state
- [ ] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests

### Automated tests
- At most one morning, one reminder and one follow-up per user per day, even if analysis runs twice.
- Follow-through answers are refused before 8pm, on train-as-planned days, and after the next morning.
- Reminder and follow-up text contains no health detail.
- Planner: a user at 7:30pm gets no follow-up; at 8:00pm they do; a train-as-planned day gets none.

### Manual verification
1. **Morning push:** let a real morning sync run.
   *Expected:* one notification with status and reason; tapping opens the card.
2. **Reminder:** skip the sync until 11:30 on a test morning.
   *Expected:* one reminder with no health detail. A sync before noon gives the card marked late.
3. **8pm:** on a change day, wait until 8pm.
   *Expected:* the follow-up arrives, and tapping opens the card with the question at the top. Before 8pm, no question is shown.
4. **Answer:** tap Yes, then Change, then No.
   *Expected:* each answer is recorded with its time and source, and the card shows the latest.
5. **Carry-over:** leave a question unanswered overnight.
   *Expected:* the next morning's card asks about yesterday first.

---

## Phase 5: Trends, digest, settings and owner page

**Goal:** finish the remaining screens and the owner's tools.

**Status:** Not started

### Tasks
- [ ] Build the trend view: one chart per score reading, last 8 weeks, normal-range band, flagged nights, gaps
- [ ] Build the weekly digest job (Monday 5am local) and page, including the "first digest" and missing-days states
- [ ] Build Settings:
  - notifications status
  - upload token create and reissue (password check)
  - setup guide link
  - change password
  - sign out everywhere
  - delete my data (password check and confirmation)
- [ ] Build `owner-status` and the owner-only page: last sync, reminder days, delivery failures, import progress, project activity
- [ ] Write the owner admin script to reset a password and set the change-password flag
- [ ] Write the events loader script
- [ ] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests

### Automated tests
- Delete my data removes every reading, result, answer, token and subscription for that user only.
- Reissuing a token makes the old token fail at once.
- `owner-status` refuses non-owners and returns no health values.
- The digest for a fixed sample week matches its expected facts.

### Manual verification
1. **Trends:** open "See your trends".
   *Expected:* three charts, 8 weeks, bands shaded, missing nights as gaps.
2. **Settings:** reissue the token, then run the Shortcut with the old one.
   *Expected:* the old upload is rejected and the card says sync is being rejected.
3. **Sign out everywhere:** use it on your iPhone.
   *Expected:* every session ends, including a laptop browser.
4. **Owner page:** open it as the owner, then as the test account.
   *Expected:* the owner sees status for every user; the test account can't open it.
5. **Password reset:** run the admin script for the test account.
   *Expected:* the temporary password works once, then a new password is required.

---

## Phase 6: Hardening and dry run

**Goal:** make the app safe and ready for testers, then prove it with one tester for a week.

**Status:** Not started

### Tasks
- [ ] Turn on a strict Content Security Policy; confirm there are no third-party scripts
- [ ] Review secrets: none in the repository, the secret key only in server functions
- [ ] Re-run every row-level security and upload-path test against the live project
- [ ] Make the first `db dump` backup to an encrypted laptop folder; practise one restore on the local copy
- [ ] Check the Cayman Data Protection Act's rules for health data and storage in the US
- [ ] Write the consent form (including lock-screen visibility and US storage) and collect signatures
- [ ] Write the one-page setup guide (home screen, sign-in, notifications, Shortcut, token, import, automations, "When Unlocked", who to contact). From the 1b spike: turn on Settings, Apps, Shortcuts, Advanced, "Allow Sharing Large Amounts of Data"; build each automation from the Automation tab (iOS 27 shows it as "When ... is Opened"/"When power Disconnects"), with a Text action holding exactly `charger` or `app`, then Run Shortcut with that Text as input
- [ ] Publish Shortcut template v1 (blank, asks for the token at install)
- [ ] Check the one-screen fit on each tester's iPhone model
- [ ] Run a one-week dry run with one tester; fix what breaks. Includes the tester-phone part of 1b (D44): both automations on their phone, the locked-phone rate and the sleep stages from their Watch
- [ ] Freeze the score settings; tag the release; write the changelog
- [ ] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests

### Automated tests
- The full suite passes on the release tag: database, functions, front end and end to end.
- The CSP check: the page loads no outside scripts.

### Manual verification
1. **Restore:** restore your latest backup into the local copy.
   *Expected:* every table and row is present.
2. **Dry run:** the tester uses the app for 7 mornings.
   *Expected:* a sync on at least 6 of 7 days, notifications delivered, no unexplained card states, and their feedback logged.
3. **Fit:** open the morning card on each tester's phone model.
   *Expected:* no scrolling.

---

## Phase 7: Four-week test

**Goal:** run the test exactly as agreed, with no changes to the score.

**Status:** Not started

### Tasks
- [ ] Onboard the testers with the guide; confirm each has a year imported and a status on day one
- [ ] Check the owner page every morning; follow up on any missed sync the same day
- [ ] Back up at least weekly and before any database change
- [ ] Make no changes to score logic or settings during the test
- [ ] Hold the end-of-test conversation with each tester
- [ ] Move the project to Supabase Pro after the test, and switch on the 30-day inactivity sign-out
- [ ] Code review of anything changed during the test (fixes only; score logic stays frozen); fix what it finds, then re-run the full test suite

### Manual verification
1. **Daily:** check the owner page.
   *Expected:* every user synced, or the cause is known that day.
2. **Weekly:** check the backup folder.
   *Expected:* a backup no more than 7 days old.
3. **End:** check that all four weeks are complete.
   *Expected:* 28 days of data per user, and conversations held.

---

## Phase 8: Results and demo

**Goal:** judge the test against the agreed targets and prepare the two-layer demo.

**Status:** Not started

### Tasks
- [ ] Calculate every target:
  - sync on 26 of 28 days
  - notifications delivered on 90% of days with a status
  - isolation
  - correctness
  - Signal on your year
  - quiet by default
  - tester agreement on days with a status
  - engagement
  - action
  - retention
- [ ] Report partial-data days separately, and each tester's check-in completion rate
- [ ] Write up the testers' own words from the conversations
- [ ] Build the main demo story: one week from your data where the tool flagged something early, starting from Apple Health's plain numbers
- [ ] Build the appendix: arithmetic, trends, the SQL-versus-pandas check, the disrupted-day check, every target and its result, limitations, and the causal layer as a worked method
- [ ] Apply the retention rule to testers' data (90 days after the test unless they agree otherwise)
- [ ] Code review of everything changed in this phase; fix what it finds, then re-run the full test suite
