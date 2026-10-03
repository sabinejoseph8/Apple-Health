# Progress: Clarivi

**Status of this plan:** Agreed, v1.0 (30 September 2026)
**Last updated:** 3 October 2026 (Phase 2 done, reviewed and live, self-test started; Phase 1b's locked-phone check collecting over a week; decisions D42 to D60)
**Builds on:** product-spec.md (Agreed, v1.0), tech-spec.md (Agreed, v1.0), design.md (Agreed, v1.0)

---

## Summary

- **Current phase:** Phase 2 done (self-test running); Phase 3 next, while Phase 1's last check collects itself
- **Overall status:** Phase 1a done (3 October 2026). Phase 1b in progress (3 October 2026): the upload path is live (tokens, the `ingest` function, readings tables), the Upload token section is on the home screen, and the Clarivi Sync Shortcut is installed on Sabine's iPhone and reaches the live server. The first spike runs on her phone changed the post format to columns (D42) and moved the 6pm-to-noon heart-rate window to the server (D43). Work is on branch `phase-1b-daily-sync`, merged to `main` for each release.
- **Phase 2a (3 October 2026):** nights, normals and the analysis queue are built on branch `phase-2a-nights` (from `phase-1b-daily-sync`) and pass their tests on the local copy. The night rules are D48. Released the same day: the every-minute scheduler built Sabine's 239 nights and their normals within a minute. The first look at them found overlapping sleep records on 18 nights, which counted sleep twice; Sabine chose to count each moment once with awake winning (D49), released as a second migration. Checking one night against the Health app then showed the 90-minute rule cutting nights with a long awake spell (41 of 239 nights); Sabine chose to count all sleep from 6pm to noon as the night (D50), a third migration. With all three live, Sabine's year has 237 nights with all five normals built, and two nights checked against the Health app (one imported, one from a daily sync) each match within 2 minutes. 2a done on 3 October 2026.
- **Phase 2b (3 October 2026):** score settings, the daily status (points, zones, missing and building readings, the nudge, the illness check) and insights are built on branch `phase-2b-status` (from `phase-2a-nights`) and pass their tests on the local copy, with Sabine's decisions D51 to D53. Phase 2's manual check 2 now uses an automated test for the design's made-up sample day. Released the same day: Sabine's year has 237 days with a status row (105 Ready, 19 Ease off, 4 Rest, 108 learning your normal, 1 not enough data); the illness check ran on 128 and showed its note on 12. Sabine checked 3 October's breakdown by hand (Ready, 0.47 points, all from a short sleep). 2b done on 3 October 2026.
- **Notes for 2c:** 108 of 237 days are "learning your normal" because gaps in Watch tracking leave fewer than 21 valid nights in 28 (the window and minimum are settings now); Ease off or Rest fire on 23 of 128 scored days (about 1 in 6, above the "about 1 in 7" limit); a short night can still be Ready because Sabine's sleep varies widely (a wide normal range) and sleep weighs 25%; "prioritise sleep" never fires on her year; Sabine doesn't remember the flagged days, so the calendar check matters.
- **Phase 2c (3 October 2026):** the events and workouts tables, the owner's loader scripts, the pandas reference with its check and the Signal measurement are built on branch `phase-2c-tuning` (from `phase-2b-status`) and pass their tests; the reference matches the database on a made-up history. Decisions D54 and D55.
- **First reference check on Sabine's year (3 October 2026):** statuses matched on all 237 days; nights differed on 1 value (one night's resting heart rate) and normals on 62 (its knock-on), because two watches gave resting heart rates for the same day and an app (Athlytic) also wrote some. Fixed with D56 and D57 (migration `20261004020000_watch_sources.sql`). The terminal panel showed Sabine's password at the hidden prompt, so the scripts now remember the sign-in and she is changing her password.
- **Reference check passed (3 October 2026):** after the Watch-only fix (released) and Sabine's password change, `check.py --live` matches the database on all 237 nights, 1,185 normals and 237 statuses (the D9 correctness gate, for settings version 1; rerun after any change to the rules or settings).
- **Events (3 October 2026):** no calendar illness or major events (Sabine doesn't remember any; D58); the trip's two travel days are loaded from `private/events.csv`.
- **Workouts and measurement (3 October 2026):** the Health export gave 280 workouts (242 from the Ultra, 18 from the second watch, 20 from apps, which don't count); loaded. Measured on her year: version 1 fired on about 1 day in 6 and caught 0 of 11 disrupted days with a status; judged by day (D60), 1 of 13. Sabine set the final numbers (D59): version 2, normals from 42 nights, Ease off from 1.2, Rest from 2.4, frozen. **Signal on her year: not met** (1 of 13; the evidence is thin, D58), recorded in mvp.md; the testers' check-ins carry the Signal.
- **2c done (3 October 2026):** version 2 is live and frozen; Sabine's year has 181 Ready, 25 Ease off, 3 Rest and 27 learning days; the reference check matches on all 237 nights, 1,185 normals and 237 statuses under version 2. Phase 2 manual checks: 1 (reference) passed; 2 (sample day) is an automated test, and a recent real morning was checked by hand; 3 (Signal on her year) measured and not met, recorded in mvp.md; 4 (no-push imports) holds in the queue (imports never ask to notify, tested), and is checked again on the outbox in Phase 4.
- **Phase 2 code review (3 October 2026):** 14 findings. Fixed: Sabine's readings, dates and trip had been written into the public docs, migration comments and two tests (removed, and the Phase 2 branches rewritten on GitHub so the old commits are gone); a morning sync with no night yet now says "night not finished" on the day, not "not enough data"; failed analysis work is retried (3 attempts); every settings version must give each reading a positive smallest spread; the job log is trimmed daily; tests now prove signed-in users can't run any analysis function; the owner's session file is private from the moment it's written; the workout extractor leaves out impossible and copied workouts; small clean-ups. Decided by Sabine: record what each person was shown each morning in Phase 4 (D61, a new Phase 4 task); keep the 6pm rule (a sleep starting just before 6pm with no wake-up counts as a nap, a known limit). Not changed: the Watch-sources lookup reads all heart rate (about 0.04 seconds a year; fine for v1).
- **Self-test helper:** `.venv/bin/python scripts/reference/today.py` prints this morning's status in plain words (or a given date's), using the remembered sign-in; `--felt good|okay|off "note"` saves how Sabine felt beside that day's status in `private/selftest.csv` (never committed), for the end-of-self-test review. Watch for: Ready after a short night on mornings she feels off (a risk noted in 2c); if it's a pattern, a new settings version can still change it before the test (D59).
- **Phase 2 done (3 October 2026):** all tasks ticked; the self-test started the same day and runs each morning until about 17 to 24 October 2026 (Sabine runs `today.py` after her sync and notes whether the status matches how she feels).
- **Next action:** plan Phase 3 (readiness card, check-in and Why today) while the self-test runs. Phase 1's last check (the locked-phone rate) is read around 10 October 2026; then Phase 1 closes and the branches merge to `main` (Sabine runs the merge, as it deploys production). Separately, 1b's last check (the locked-phone rate) collects itself over about a week of mornings (until about 10 October 2026); then tick it, close Phase 1 and merge to `main` (Sabine runs the merge, as it deploys production). 1c and Phase 1's code review are done.
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
| 2 | Data and analysis | Done (self-test running) |
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
- [x] Build the Shortcut template: ping first, then read and post readings; save "synced today" to iCloud Drive when the night is complete
- [x] Set up both automations (charger unplugged; chosen app opened) on your phone (the tester's phone moved to the Phase 6 dry run, D44)
- [x] **Check:** do Watch sleep stages arrive, or only "asleep"?
- [ ] **Check:** how often does the unplug run fail because the phone is locked?
- [x] **Check:** do readings from a past trip keep their recorded time zone?

### 1c. One-year import
- [x] Add monthly import to the Shortcut (12 parts, resumable)
- [x] Time a full import on your phone and measure the size of one month's post (the tester's import moved to the Phase 6 dry run, D45)
- [x] Interrupt an import on purpose and confirm it continues from the last finished month
- [x] Count the nights in your year with at least one HRV reading inside the sleep window

### End of Phase 1
- [x] Code review of everything changed in Phase 1 (1a to 1c); fix what it finds, then re-run the Phase 1 automated tests

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
- **Sleep stages (check 1, answered):** the Watch's stages come through by name (Core, Deep, REM, Awake), not only "asleep". Seen on Sabine's iPhone with Clarivi Check, and stored on the server as awake, core, deep and REM in the first full post.
- **Health searches only work in whole days.** "Start Date is after" a time finds nothing; "between" two times and "in the last N hours" widen to whole days; "in the last 1 day" means yesterday and today. A date-only text ("2026-10-03") is read as noon. Fallback taken: fetch whole days, apply the heart-rate window on the server (D43).
- **One line per reading is far too slow.** 1,063 heart-rate readings took 14 minutes 28 seconds; joining each column as a list took 1.3 seconds. Fallback taken: send columns (D42). This also makes the 1c import practical.
- iOS blocks a Shortcut from sending more than a small number of Health items until Settings, Apps, Shortcuts, Advanced, "Allow Sharing Large Amounts of Data" is turned on (1,138 items were refused). Sabine turned it on; it goes in the setup guide.
- With it on, the first full post stored 305 readings: 237 heart rate (12 to 15 an hour across 6pm to noon; about 830 from noon to 6pm were set aside, as D43 intends), 13 HRV, 39 breathing rate, 1 resting heart rate and 15 sleep stages (awake, core, deep, REM).
- **Sleep readings have no source:** Shortcuts reports no source for sleep readings (checked with Clarivi Source Check: "Source" is empty for all 31, "Name" is just "Health sample"); heart rate, HRV and breathing rate do have one. Nothing to fix in the Shortcut or server. For Phase 2's Watch-only rule (D10), Watch sleep is recognised by its stages (core, deep, REM, awake), which only the Watch writes; the iPhone writes only "in bed" and "asleep". A third-party sleep app writing stages would look the same, so the setup guide asks testers whether they use one.
- Both automations are set up on Sabine's iPhone (iOS 27's new editor: the trigger is the first block of the automation). The tester-phone part moved to the Phase 6 dry run (D44, 3 October 2026).
- **Past time zones (check 3, answered): lost.** Sleep readings from a 2026 trip one hour ahead of home all came back with the home offset (-05:00), not the trip's (-04:00): Shortcuts stamps every reading with the phone's current time zone. Daily syncs are unaffected (each morning's readings get the phone's zone at the time, even while travelling); the one-year import is. Fallback from the tech spec, for Phase 2: take trips from the calendar (Sabine's trip dates are kept in `private/`, as the repository is public) and, for testers, ask about travel or detect it from shifts in sleep timing. A one-hour shift doesn't change which date a night belongs to; larger ones can.
- **First real morning (3 October 2026):** both automations ran on their own. Repeat runs stored nothing twice (every reading recognised as a duplicate). Two charger runs (4:47am and 5:04am) sent their ping but never read Health, the pattern of a locked phone; charger runs at 4:09am and 8:40am got through.
- **The Watch's sleep record reached the iPhone after waking**, later than the 8:40am charger run and the 8:45am app run, so neither could complete the night. Until it arrived, Clarivi correctly said the night wasn't finished (no false "complete"). The next app run, at 9:14am, sent it (16 sleep stages, 5:05am to 8:35am, plus 26 breathing-rate readings) and the night was marked complete. This is what the catch-up trigger is for; how often it leaves the night incomplete until late morning is part of check 2.
- **"Synced today" file:** the first automation runs couldn't save it: iOS needs a one-time permission for a shortcut to use iCloud Drive and can't ask while an automation runs in the background, so the save was quietly refused (the folder was created, the file wasn't). After one run by hand (permission allowed), the app automation found the file and stopped without contacting the server. The setup guide must include: run Clarivi Sync by hand once and allow Health and file access.
- Still to measure: the locked-phone rate (check 2), over about a week of mornings.

**Phase 1 code review (3 October 2026)**
- Reviewed everything Phase 1 changed (1a to 1c). Ten findings: eight fixed, one accepted for v1 (D46), one fixed by a decision (D47). All four GitHub checks pass afterwards, including a new "Local end to end" job that runs the token, sync and import checks against a local Supabase on every push.
- Fixed: a post counts only if the reply says what it accepted (a gateway error could otherwise mark an import month done); import progress counts a month only when its last part arrives (`month_complete`); quotes and backslashes in device names can't break a post; signed-in users have only SELECT on every table (TRUNCATE ignores row-level security); signing out unsubscribes the phone from notifications; the Shortcut's notification title comes from the wording module; spike-only check code removed.
- Decided by Sabine: D46 (accept that part of past trip nights' heart rate is lost in the import, for v1) and D47 (pings get their own 200 an hour, outside the 60).
- Released 3 October 2026: migration `review_fixes`, `ingest` version 6, and the Shortcut reinstalled with a reissued token.

**1c. One-year import (done, 3 October 2026)**
- **Imported:** all 12 months (mid-November 2025 to today), about 126,600 readings: 104,941 heart rate (6pm to noon), 12,576 breathing rate, 5,597 sleep stages, 3,174 HRV and 346 resting heart rate. None set aside. Watch data on Sabine's phone starts around 12 to 13 November 2025.
- **HRV coverage (task 4):** 240 nights have at least 3 hours of tracked sleep; 239 of them (99.6%) have at least one HRV reading inside the sleep window, 232 have two or more, 189 three or more (median 3 a night). The "HRV too sparse at night" risk doesn't apply to Sabine. About 85 of the roughly 325 nights since mid-November have no tracked sleep, which Phase 2's missing-reading rules must handle.
- **Resuming (task 3):** stopped by hand after "3 of 12", the next run skipped the finished months and carried on with July.
- **Time and size (task 2):** a clean run did seven months in about eight minutes (about 70 seconds a month), so a full year takes about 15 minutes in one go. A month goes in 3 to 14 posts: its small readings (90 to 180 KB) and heart rate parts of about 250 to 380 KB, each stored in about a second. Runs stopped part-way three times (with iOS's generic "There was a problem" message: after April's first post, during June, and at November's start); each re-run carried on, so the full import took about an hour of attempts today.
- **What it took to get there** (each found with a check Shortcut on Sabine's phone; details in tech-spec.md section 4):
  - Adjust Date ignores steps of whole months; month steps are made in hours.
  - iOS stops a Shortcut when one step handles about 3,900 heart rate readings (about 2,000 work), so heart rate is read one day at a time, with a cap of the first and last 1,000 readings on heavy days (agreed by Sabine).
  - iOS times out a post of about 680 KB before it leaves the phone (385 KB works), so each month goes in parts of about 250 KB, with the small readings on their own.
  - A post made just after the day-by-day loop failed every time, whatever its size, so the last part is sent inside the loop.
  - One resting heart rate reading longer than a day refused a whole month's post: resting heart rate may now span up to a week, and any reading that fails a check is set aside while the rest is stored (agreed by Sabine).
  - Import posts have their own limit of 200 an hour per token (agreed by Sabine); everything else keeps 60.

---

## Phase 2: Data and analysis

**Goal:** turn raw readings into correct nights, baselines, a daily status and a nudge. Prove them against an independent check, and set the score numbers.

**Status:** Done (3 October 2026); the self-test runs until about 17 to 24 October

Split into four groups (agreed 3 October 2026): 2a nights and normals, 2b the daily status, 2c proving and tuning, then the end step.

### 2a. Nights and normals
- [x] Build `nights`: sleep window from Watch sleep stages, local wake date, finished flag, sleeping heart rate (median while asleep), HRV median and count, breathing rate, yesterday's resting heart rate, coverage and confidence (rules in D48, D49 and D50)
- [x] Build `baselines`: 28-night median and scaled spread, excluding the night judged; 21-valid-night minimum; normal range
- [x] Build `analysis_queue` and the every-minute scheduler; imports recompute once at the end and never notify

### 2b. The daily status
Decided 3 October 2026: points D51, nudge D52, illness check D53. "Waiting", "no sync by noon" and "late" depend on clock and sync times, so they come with the card and notifications (Phases 3 and 4).
- [x] Build `daily_status`:
  - points per reading, total and zones
  - a missing reading's weight moved to the other two
  - no status with two or more missing
  - "Learning your normal"
  - never Ready without enough data
- [x] Build the illness check and nudge selection from the four actions; write results to `insights`
- [x] Build `score_settings` (versioned) with the starting numbers: HRV 40%, sleeping heart rate 35%, sleep 25%; Ease off from 1, Rest from 2

### 2c. Proving and tuning
Decided 3 October 2026: workouts from a one-time Health app export (D54); disrupted mornings are each day of illness, the morning after travel or a major event, and the morning of a workout far below usual (D55). From the first reference check on Sabine's year: only Watch readings count, a Watch being any source that records heart rate (D56); two watches' resting heart rates for one day give their median (D57).
- [x] Load your events (illness, major events) from your calendar; detect travel days (or take them from the calendar if time zones were lost in Phase 1)
- [x] Import your workout summaries for the Signal check
- [x] Write the pandas reference notebook and compare it with the SQL stage by stage on your year (a script, `scripts/reference/check.py`; 3 October 2026: all 237 nights, 1,185 normals and 237 statuses match)
- [x] Measure on your year: the disrupted-day match, how often Ease off or Rest fire, and how often each reading is missing
- [x] Set the final score numbers, decide the HRV minimum and the ease-off cap, then record them

### End of Phase 2
- [x] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests (3 October 2026: 14 findings, 11 fixed, 3 decided by Sabine; fixes live, reference check still matches)
- [x] Start the two-to-three-week self-test: read your own status each morning before the screens exist (started 3 October 2026 with `scripts/reference/today.py`; runs until about 17 to 24 October)

### Automated tests
- Night dating: a known night is assigned the right date, including across a time-zone change.
- Baseline: a fixed 28-night example gives the expected median, range and 21-night rule.
- Missing reading: with HRV missing, the weights move as expected (for example, the sample day totals 1.19: Ease off under the starting numbers, Ready under the final ones, where Ease off starts at 1.2).
- Learning your normal: with two readings building, the status is none, never Ready.
- Recompute: running the analysis twice gives identical results.
- Built in 2c, final numbers: `10_final_settings.test.sql` (9 checks: version 2 is active and frozen with the agreed numbers, its numbers can't change, the sample day under version 2); `09_watch_sources.test.sql` (5 checks: Watch readings only, two watches' median). `07` now pins version 1 for the agreed examples.
- Built in 2c: `supabase/tests/database/08_events_workouts.test.sql` (11 checks: only the owner loads events and workouts, a load replaces the last, bad input is refused, nobody writes directly, testers see none of it); the pandas reference's unit tests (14, `scripts/reference/test_*.py`); and the reference check on a made-up history (`scripts/reference/check.py --local-synthetic`), all on every push.
- Built in 2b (`supabase/tests/database/07_daily_status.test.sql`, 45 checks): the design's sample day from made-up nights and normals (points 0.9, 0.6 and 0.1, total 1.6, Ease off, train easy); with HRV missing (1.19, Ease off, based on 2 of 3, prioritise sleep); two missing (not enough data, no nudge); two building (learning, never Ready); one building and one missing; an unfinished night; a morning sync with no night; Ready, better than normal, Rest; sleep-led Ease off; the illness check firing, not firing, not running and never changing the status; insights; recompute twice gives identical results; a new settings version with the ease-off cap; frozen settings can't change; isolation, and users can't read the settings.
- Built in 2a (`supabase/tests/database/04_nights_baselines.test.sql`, 39 checks, and `05_sleep_overlaps.test.sql`, 9 checks: overlapping records count once, awake wins, nights without overlaps are unchanged; and `06_night_window.test.sql`, 8 checks: sleep from 6pm counts towards the next morning, breaks of any length stay in the night, afternoon sleep is a nap, a stretch starting before noon counts in full): night dating at home and on a trip 8 hours ahead; asleep stages only (not "in bed" or awake); naps and sleeps under 2 hours aren't nights; gaps of 100 minutes keep sleeps apart and 80 minutes join them; the 10-reading minimum; the 28-night example (median, spread, range); the 21-night rule; recompute twice gives identical results; the queue (a daily post queues work that notifies, an import waits and never notifies, each user's work stays separate). The local import load check (`npm run check:local:import`) also rebuilds a made-up month's 30 nights in under 10 seconds.

### Manual verification
1. **Reference check:** run the pandas notebook on your year.
   *Expected:* every stage matches the SQL exactly (or within rounding).
2. **Sample day:** the design's Tuesday 29 September (sleeping heart rate 51, normal 50) uses made-up numbers, so it is checked by an automated test instead (changed 3 October 2026: Sabine's real readings for that date are different). Manually: look at a real recent morning in `daily_status` with its readings and normals.
   *Expected:* the points add up from the readings, normals and weights, and the status and nudge follow D51 and D52.
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
- [ ] Keep, for each user and day, the status, nudge and reason that were shown: when the morning notification is sent and when the card is first opened, saved permanently; the test's Signal and Action results use this record, since recalculation may later correct a past day (D61, from the Phase 2 code review)
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
- [ ] Write the one-page setup guide (home screen, sign-in, notifications, Shortcut, token, import, automations, "When Unlocked", who to contact). From the 1b spike: turn on Settings, Apps, Shortcuts, Advanced, "Allow Sharing Large Amounts of Data"; run Clarivi Sync by hand once and allow Health and file access (automations can't ask for permission); ask whether they use a third-party sleep app (sleep has no source in Shortcuts, so Watch sleep is recognised by its stages); ask about long trips in the past year (D46: part of those trip nights' heart rate is lost in the import, and Phase 2 marks them as travel days); build each automation from the Automation tab (iOS 27 shows it as "When ... is Opened"/"When power Disconnects"), with a Text action holding exactly `charger` or `app`, then Run Shortcut with that Text as input
- [ ] Publish Shortcut template v1 (blank, asks for the token at install)
- [ ] Check the one-screen fit on each tester's iPhone model
- [ ] Run a one-week dry run with one tester; fix what breaks. Includes the tester-phone parts of 1b and 1c (D44, D45): both automations on their phone, the locked-phone rate, the sleep stages from their Watch, and timing their one-year import (the setup guide says: if the import stops part-way, run it again; it carries on from the last finished month)
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
