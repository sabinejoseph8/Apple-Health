# Progress: Clarivi

**Status of this plan:** Agreed, v1.0 (30 September 2026)
**Last updated:** 8 October 2026 (the Phase 6 code review: 10 findings, 8 fixed, 2 left by Sabine for later, and every past-day screen now speaks of "that night" and "that day"; D89: Sabine is the only tester and the test runs two weeks; D88 built: past days; D87 released through https://github.com/sabinejoseph8/Apple-Health/pull/16: a card for a night without sleep stages and a trends row on cards without a status; a branch rule for `main` and auto-merge allowed; D86 live and merged through https://github.com/sabinejoseph8/Apple-Health/pull/14, with the Supabase library pinned; re-adding the Home Screen app loses its notification sign-up, turned on again. 7 October: the setup guide's line for a locked run released through https://github.com/sabinejoseph8/Apple-Health/pull/13; the notification fix confirmed; 5 and 7 October in the locked-phone count. 6 October: the setup guide's Sync now line released through https://github.com/sabinejoseph8/Apple-Health/pull/12, functions redeployed; Phase 4 manual check 2 passed: the 11:30 reminder, Sync now and the Late card; the server functions redeployed so notifications use the new words; Phase 3 done after Sabine's wording review, D85; consent version 2 and the new wording released and approved in the live app; the Clarivi Memory site refreshed from these files, with an MVP tab, its builder kept in `scripts/memory-site/`. Earlier, 5 October: Phase 4 manual check 1 passed on the first real morning; in-app consent and Sync now released and agreed by Sabine and the test account; the key work D81 done; decisions D83 (afternoon naps stay out) and D84 (Sync now); the dry-run checklist and the v1.0.0 changelog draft approved; Phase 6 now waits on the testers' details for the fit check and the dry run. Earlier, 4 October: Phase 5 done; Phase 6 planned and step 1 done; D75 to D82)
**Builds on:** product-spec.md (Agreed, v1.0), tech-spec.md (Agreed, v1.0), design.md (Agreed, v1.0)

---

## Summary

- **Current phase:** Phases 2, 3 and 5 are done (Phase 3 on 6 October 2026, after Sabine's wording review). Phase 4 is live with manual checks 1 (5 October) and 2 (6 October, the 11:30 reminder) passed; checks 3 to 5 need a change day. Phase 1 has one check left (about 10 October). Phase 6: step 1 done; step 2 done except the fit on testers' iPhones (in-app consent, Withdraw consent, "Your data", Sync now and the key work D81 all released on 5 October); step 3, the dry run, was prepared for a tester (`docs/dry-run-checklist.md`). **Changed 8 October 2026 (D89): Sabine is the only tester, and Phase 7's test runs two weeks instead of four; testers come with the following release.** Approved by her the same day: the targets are revised for one person over two weeks (product-spec section 9), the fit check and the dry run are dropped, and Phase 8 uses her own written account. Sabine's self-test runs until about 17 to 24 October. **Phase 6 code review done 8 October 2026** (10 findings, 8 fixed, 2 left for later with Sabine's OK); only the freeze, tag and changelog remain, after the self-test.
- **Phase 1 (Spikes):** 1a, 1c and the Phase 1 code review are done. 1b is done except its last check, the locked-phone rate, counted until about 10 October 2026 from the uploads log plus Sabine's notes of mornings she sees the Shortcuts "device is locked" message (D75); then Phase 1 closes.
- **Phase 2 (Data and analysis), done 3 October 2026:**
  - Nights from the Watch's sleep stages (D48 to D50), normals (D11, now from 42 nights), the daily status, nudge and illness check (D51 to D53), insights, versioned score settings, and the every-minute analysis queue, all live.
  - Only Watch readings count, a Watch being any source that records heart rate; two watches' resting heart rates give their median (D56, D57).
  - Final numbers: settings version 2, frozen (D59): weights 40/35/25, Ease off from 1.2, Rest from 2.4. On Sabine's year: 181 Ready, 25 Ease off, 3 Rest, 27 learning days (about 1 in 7.5).
  - Correctness gate met: the independent pandas reference (`scripts/reference/check.py`) matches the database on all 237 nights, 1,185 normals and 237 statuses of her year, and on a made-up history on every push.
  - Signal on her year: not met (1 of 13 disrupted mornings called Ease off or Rest); the evidence is thin (no calendar events, D58), so the testers' check-ins carry the Signal. Recorded in mvp.md.
  - Code review: 14 findings, 11 fixed, 3 decided by Sabine (D61 moves "record what was shown each morning" to Phase 4; the 6pm rule is kept). Her readings had been quoted in the public docs; removed, and the Phase 2 branches were rewritten on GitHub.
- **Self-test:** each morning Sabine runs `.venv/bin/python scripts/reference/today.py` and saves how she felt with `--felt good|okay|off` (kept in `private/selftest.csv`, never committed). Day 1 (3 October): Ready, but she felt off after a short night, the case 2c flagged. At the end, compare her answers with the statuses; if "Ready after a short night" keeps meeting "off", a new settings version can still change it before the test (D59).
  From 4 October 2026 the app's own check-in replaces `--felt`: Sabine checks in on the card each morning (on the preview until the merge into `main`, then in the Home Screen app), before she sees the status, so the answer is recorded unshaped by it, in the `checkins` table with the day's status beside it in `daily_status`. The end-of-self-test review uses `private/selftest.csv` for 3 October and the check-ins from 4 October. `today.py --felt` stays available for a note.
- **Branches:** `main` holds Phases 1 to 5 and Phase 6 so far: Phases 1 to 3 through https://github.com/sabinejoseph8/Apple-Health/pull/1 (D69), Phase 4 through https://github.com/sabinejoseph8/Apple-Health/pull/2, Phase 5 through https://github.com/sabinejoseph8/Apple-Health/pull/3 and https://github.com/sabinejoseph8/Apple-Health/pull/4, Phase 6 through https://github.com/sabinejoseph8/Apple-Health/pull/7, https://github.com/sabinejoseph8/Apple-Health/pull/8, https://github.com/sabinejoseph8/Apple-Health/pull/9 https://github.com/sabinejoseph8/Apple-Health/pull/10 (consent, Withdraw consent, "Your data", Sync now) and https://github.com/sabinejoseph8/Apple-Health/pull/11 (the wording review, consent version 2, and 5 October's notes) and https://github.com/sabinejoseph8/Apple-Health/pull/12 (the setup guide's Sync now line, the doc fixes and the Memory site builder; merged 6 October 2026 at 12:05pm, then the functions redeployed) and https://github.com/sabinejoseph8/Apple-Health/pull/13 (the setup guide's line for a locked run, "Tap to run": unlock and tap Continue; merged 7 October 2026 at 2:01pm, then all eight functions redeployed, each still refusing calls without a sign-in or key) and https://github.com/sabinejoseph8/Apple-Health/pull/14 (D86 and the Supabase library pinned to 2.117.2; merged 8 October 2026 at 11:40am, then all eight functions redeployed and checked) and https://github.com/sabinejoseph8/Apple-Health/pull/16 (D87: the no-sleep-stages card and the trends row on cards without a status; Sabine ran `npx supabase db push` first, then the merge at 12:19pm and the functions redeployed; only her 8 October was relabelled, as the import's older stage-less nights have no daily row). From 8 October auto-merge is allowed on the repository, and a branch rule (ruleset "main": no deletion, no force push, the four GitHub checks required) applies to `main` (its target added by Sabine the same day), so merge requests can merge themselves once the checks pass. Production (https://clarivi-zeta.vercel.app, the Home Screen app) runs all of `main`. The live database has every migration through `20261014000000_consent_v2.sql` (6 October 2026), and every function is deployed.
- **Phase 3 plan (agreed 3 October 2026):** built on branch `phase-3-card` (from `phase-2c-tuning`) in three steps, each ending with something Sabine can look at: 1, groundwork (design tokens; the wording module, with a sample sheet of every state's words for Sabine to approve; the database additions: check-ins, the usage log and the zone-numbers function); 2, the check-in and the readiness card with every state; 3, Why today. Decisions: D62 (the zone numbers come from a small database function, never the weights), D63 (until Phase 5, Settings opens the temporary account screen, and the digest row and trends button are left out), D64 (the rejected-sync and import-progress card states are built in Phase 3).
- **Phase 3 progress (4 October 2026, branch `phase-3-card`, local copy only):** steps 1 to 3 are built and pass every automated test (69 unit, 25 end to end at iPhone size, 258 database), nothing applied to the live project yet.
  - Step 1: design tokens; the wording module and `briefing.ts` (the design's sample day comes out word for word); the wording sample sheet (`npm run wording:sheet`); `checkins`, `usage_events`, `submit_checkin`, `log_usage` and `status_zones` (migration `20261005000000_checkins_usage_zones.sql`). Sabine's first wording change: the Ready headline is "Your readings are all normal" ("normal or better" when a reading was better than normal).
  - Step 2: the check-in (first open of the day, Skip, Change), the readiness card with every state (waiting, readings in, sleep in progress, no sync yet, late, no sync by noon, 2 of 3 readings, not enough data, learning your normal), the rejected-sync notice and import progress (D64), and Settings as a stand-in (D63). The morning card fits 390 by 763 points, tested.
  - Step 3: Why today (summary, three reading cards with four-week charts and the numbers, Also checked, how the status is decided with points and zones).
  - Screens checked on made-up data: in the dev server against the local copy (`node scripts/local-card-demo.mjs <state>`), and as screenshots of every state (`SCREENS=1 npx playwright test e2e/screens.spec.ts`).
- **Phase 3 code review (4 October 2026, before release):** 10 findings. Fixed: Why today's total could round onto a zone limit (1.19 shown as "1.2" beside "Ready under 1.2"; now 1.19); a card left open past midnight kept yesterday's status under today's date (R25; it now reloads when the day changes); "Your readings are in" could promise "about a minute" all day if the analysis failed (now "taking longer than usual" after 15 minutes); an older reload or a check-in answer could overwrite newer data; a sync time from another day showed without its day; Why today made 8 queries where 3 do; duplicated helpers and test data. No change: the page's top padding (16 points under the status bar, from the safe-area inset) is right for the Home Screen app's default status bar, to be seen on the iPhone in the safe-area check. Decided by Sabine: a check-in belongs to the calendar day and can be changed until midnight (D65, refining R18). All tests re-run and pass (70 unit, 27 end to end, 258 database).
- **Released to the live database (4 October 2026, with Sabine's OK):** migration `20261005000000_checkins_usage_zones.sql` applied with `npx supabase db push`; on the live project `checkins` and `usage_events` have row-level security on, signed-in users can't write to them directly and anonymous users can't read them; Supabase's security check lists the three new functions among the intended signed-in database functions, as for `register_push`. The app changes reach production only when the branches merge to `main`; until then Sabine uses the branch preview, https://clarivi-git-phase-3-card-sabine5.vercel.app (Vercel sign-in first).
- **Phase 4 planned (4 October 2026):** D66 (the every-minute job calls the sender with its own cron key; refined the same day: made inside the database and kept only in Vault, checked by the database), D67 (follow-through answers from 8pm until noon the next day), D68 (next morning: yesterday's question, then today's check-in, then the card), D69 (merge Phases 1 to 3 into `main` once Phase 3 passes on the iPhone, then release Phase 4). Step 1 (the database) built on branch `phase-4-notifications` and tested on the local copy (migration `20261006000000_notifications.sql`, 40 pgTAP checks). Step 2 (the sender) built the same day: `send-push` sends due notifications with the cron key, tested with fakes (8 Deno tests) and end to end with a fake phone (`npm run check:local:notify`, 11 checks). Step 3 (the app) built the same day: the 8pm question on change days at the top of the card with the briefing folded, Yes and No, recorded answers with Change; yesterday's unanswered question the next morning until noon, before the check-in (with "Not now"); the tap from a notification recorded, and an answer after the 8pm one counted as given there; the card records what it showed; a notice when notifications are off or the last one failed; "Last notification delivered" in Settings. Tested at iPhone size with the clock at 7:59pm, 8pm and the next morning (10 screen tests). Released 4 October 2026 with Sabine's OK, after Phases 1 to 3 merged into `main` (D69): `npx supabase db push` applied `20261006000000_notifications.sql` (the four scheduled jobs run; the database made its cron key in Vault; the three tables have row-level security), `npx supabase functions deploy send-push` published the sender, and the functions' address was set in Vault. Checked live on the test account (no phone): the every-minute job reached the sender, which claimed a made-up reminder and recorded it as skipped (no phone); a wrong key is refused. The app part reaches production with this branch's merge into `main`. Phase 4 code review (4 October 2026, before release): 9 findings, all fixed, none needing a decision. The 8pm question now follows the nudge first shown that day, never a later recalculation; the 8pm notification isn't sent for a day already answered; a send left unfinished is marked failed rather than sent twice (at most one, R48); a failed status lookup counts as a failed send; the card records what it showed before saving an answer; the notification's kind travels in its link, so an answer straight after the 8pm one counts as given there; a test now proves the analysis queue queues the morning notification after a sync and never after an import; a stray Deno lock file removed; one shared Settings link. All tests re-run and pass (74 unit, 39 end to end, 54 function, 305 database, and the local notification check).
- **Phase 3 manual checks (4 October 2026, on Sabine's iPhone through the preview):** 1 passed (the check-in came first; the server recorded the answer as given before the status was seen); 2 passed (the card fits one screen, the date sits clear of the clock); 3 passed (Why today's title follows the status, the numbers open and close); 4 passed on the test account (Rest "Based on 2 of 3 readings" with HRV missing, then "Learning your normal" with 14 of 21 nights after its older heart rate readings were removed). Card views and Why today opens were logged. Left in Phase 3: Sabine's wording sheet review; then Phase 3 is done and Phases 1 to 3 merge into `main` (D69).
- **Phase 5 planned (4 October 2026):** D70 (the trend band follows each night's normal), D71 (the digest counts what was shown), D72 (no digest notification), D73 (the setup guide link comes in Phase 6), D74 (password reset through an owner-only server function). Step 1 (Settings) built on branch `phase-5-settings` and tested on the local copy: change password, sign out everywhere and delete my data (migration `20261007000000_delete_my_data.sql`; functions `account-change-password` and `account-delete-data`), with pgTAP (delete removes every table's rows for that person only, the account stays), screen tests and `npm run check:local:account` (13 checks, now on every push). Step 2 (trends and the weekly digest) built the same day: the trend view from Why today (three 8-week charts; the band follows each night's normal, D70; nights outside it in orange; gaps; tap or arrow keys to read a night); the weekly digest (migration `20261008000000_digests.sql`: `build_digest` works out a week's facts from what was shown, D71, and `build_due_digests` runs hourly and builds last week's from 5am on Monday local; no notification, D72), its page, and the card's "Weekly digest" row with the week or when the first one comes. The late caption under the briefing was dropped so the morning card still fits one screen with the new row (the grey Late pill stays). Tests: the fixed made-up week's facts (pgTAP), its sentences (Vitest), and screen tests for both pages and the fit. Step 3 (the owner page and the password reset) built the same day: `owner_status()` (migration `20261009000000_owner_status.sql`; refuses anyone but the owner, returns operational facts only) and the owner page from Settings (each person's last sync, 11:30 reminder days flagged after two in a row, failed notifications in two days, import progress; the database's size against the 500 MB free limit); the `owner-reset-password` function and `owner_data.py reset-password` (D74). Tested with pgTAP (owner sees all, no health value, a tester refused), screen tests, and 6 more steps in `npm run check:local:account` (19 in all). All of Phase 5 is built on the local copy. Phase 5 code review (4 October 2026, before release): 10 findings, 9 fixed, 1 kept as a known limit, none needing a decision. Fixed: the trend view said "still learning" before last night's readings arrived; trend and digest opens are now logged (migration `20261010000000_usage_more.sql`); Settings refreshes the token and phones after Delete my data; the owner page counts reminder days in each person's local time; on a Monday morning the first digest is "today"; the trend chart is announced as an adjustable control; the owner page's cards have stable keys; one shared load-failed card; the reset-password command has tests. Known limit: password re-checks share one sign-in rate limit (tech-spec, Security). All tests re-run and pass (80 unit, 57 end to end, 53 function, 344 database, 24 Python, and the local account and notification checks). Released 4 October 2026 with Sabine's OK: `npx supabase db push` applied the four Phase 5 migrations (the digest job is scheduled; the digests table has row-level security), and `npx supabase functions deploy` published the functions (the three new ones answer and refuse calls without a sign-in). The app part reaches production with this branch's merge into `main`.
- **Phase 5 done (4 October 2026).** Merged and live through https://github.com/sabinejoseph8/Apple-Health/pull/3. Its iPhone-size tests now run on a Mac in GitHub's checks (Apple's font, as on the iPhone; on Linux the taller stand-in font failed the one-screen check). Manual checks on Sabine's iPhone: 1 (trends) passed; 2 (token reissue) passed (the Shortcut skips the server once today's sync is done, so `last-sync.txt` was deleted first; the old token was refused as replaced at 2:31pm, the new one accepted at 2:34pm); 4 (owner page: the owner sees everyone, the test account has no link and is refused) passed; 5 (password reset with `owner_data.py reset-password`, then a forced new password) passed; 3 (sign out everywhere on the iPhone, with the test account also signed in on the Mac's browser: both went to the sign-in screen) passed after the fix below.
- **Sign out everywhere, fixed before check 3 (4 October 2026, branch `phase-5-checks`):** it now also stops notifications to all of the person's devices (`forget_all_devices()`, migration `20261011000000_forget_all_devices.sql`), and the app checks its sign-in on opening and coming to the front, going to the sign-in screen when it has ended. Tested with pgTAP, screen tests (signed out elsewhere goes to sign-in; offline does not) and `npm run check:local:account`. Released 4 October 2026 with Sabine's OK: she ran `npx supabase db push` (the function is live; signed-in users can run it, anonymous users can't) and merged https://github.com/sabinejoseph8/Apple-Health/pull/4.
- **Next action (8 October 2026):** 1, release D88, past days (built and tested, branch `phase-6-past-days`; app only, then `npx supabase functions deploy` as `_shared/wording.ts` changed), after Sabine's look and her answer on the past-day wording. 2, merge `phase-6-one-tester` (D89, notes only). Then Phase 4's checks 3 to 5 on the next change day; the locked-phone check around 10 October (6 October left out: both automations were off); freezing the settings after the self-test.
- **Where ticks live:** in both places: this file (`- [x]`) and the Clarivi Memory site (https://claude.ai/artifact/5Aw5x3PYAro7pDXQRkapTe). The site is rebuilt from the five project memory files with `scripts/memory-site/build.py` (6 October 2026), keeping each task's id and tick.
- **Code reviews:** every phase ends with a code review of everything it changed (D41). Phases 1 to 6 are reviewed (Phase 6 on 8 October 2026, the dry run having been dropped, D89); any change before Phase 6's tag gets a short extra review.
- **Working with Sabine:** every action for her is written under "Step for you", with each terminal command in its own command box (Run and Copy buttons) at the end of the message, and a phone notification. The owner's scripts remember her sign-in in `private/` (typed once, in the Mac's Terminal app, because the Claude app's terminal panel showed a password at a hidden prompt).
- **Known issues:**
  - Fixed 6 October 2026: the wording release at about 1am put the new words in the app but didn't redeploy the server functions, which carry their own copy of the wording module, so the 11:35am morning notification still said "close to your normal". `npx supabase functions deploy` at 11:39am, with Sabine's OK, updated `send-push` (version 12) and `ingest` (version 15); the other six were unchanged; both still refuse calls without their key. The release steps now say to redeploy the functions whenever `_shared/` changes (tech-spec, Deployment, step 5). Confirmed on 7 October 2026: the 9:41am morning notification said "usual range".
  - The server functions pin the Supabase library to `jsr:@supabase/supabase-js@2.117.2` (8 October 2026): they asked for any version 2, and the new 2.117.3 broke the functions' tests on GitHub (it needs a part that isn't installed). Move to a newer version on purpose, with the tests, never by accident.
  - Re-adding the Home Screen app loses its notification sign-up (resolved for Sabine on 8 October 2026): she removed Clarivi and added it back to get the violet icon, which starts a fresh app, so the card said "Notifications are off on this phone" (R34, as designed) until she tapped Turn on notifications in Settings (the test arrived at 11:14am). The old sign-up stays on the server until Apple reports it gone; a notification counts as sent if any of the person's phones gets it. Anyone who re-adds the app turns notifications on again.
  - Found 8 October 2026, fix built (D86, option A chosen by Sabine; migration `20261015000000_night_complete_watch_stages.sql` and `21_night_complete.test.sql`, 7 checks; all 383 database checks pass on the local copy; live since 8 October 2026: Sabine ran `npx supabase db push` in Terminal, and the live `ingest_upload` was checked to use only core, deep and REM, still runnable only by the server): the server's quick "night complete" check in `ingest_upload` counts a plain "asleep" record, while the night builder counts only the Watch's stages (core, deep, REM; D10, D49). On 8 October the only sleep record had no Watch stages, so Sync now at 10:45am was told the night was complete and later syncs that day stop early, while the analysis built no night (no status; not enough data from noon). Nothing was lost that day, as no Watch record came later, but a tester whose iPhone records "asleep" before the Watch's stages arrive would lose the morning.
  - The testers' Shortcut installs as "Clarivi Sync template" (the Shortcuts app won't take the plain name on Sabine's phone, where hers has it); testers rename it to Clarivi Sync during setup, as the Sync now button needs (D84).
  - A short night can still be Ready when the person's sleep varies widely (sleep weighs 25% and is judged against a wide normal); watch it in the self-test.
  - A sleep that starts just before 6pm and runs on without a wake-up counts as a nap (D50, kept).
  - A status shown in the morning can be corrected later (for example when the rest of a night arrives the next day); since Phase 4 (live 4 October 2026) the record of what was shown keeps the original (D61).
  - Password checks in Settings share one sign-in rate limit with signing in (a known limit from the Phase 5 code review; tech-spec, Security).
  - If the Mac's copy of the project stalls with "mmap failed: Operation timed out", the files were not all on the Mac: in Finder, set the Clarivi folder to Keep Downloaded, then `git reset --hard origin/main` (only when nothing unsaved is in the folder). Seen 4 October 2026 while updating `main`.
  - The old Phase 2 commits removed from GitHub may stay reachable by their exact address for a while before GitHub cleans them up.
  - The six merges rewritten on 4 October 2026 (Sabine's email removed) stay reachable in their old form through merge requests #3 to #6 until GitHub Support removes them (requested by Sabine on 4 October 2026); commit links in those merge requests point to the old copies.

**Set-up so far (checked 3 October 2026, end of Phase 2)**
| Item | State |
|---|---|
| Supabase project | "Clarivi" (ref `vuynnnrijdbvamwfauog`), free plan, created 2 October 2026 in US East (`us-east-1`). Live: accounts and push (1a); the upload path (`upload_tokens`, `uploads`, `samples`, `ingest_upload`, the `ingest` and `account-token` functions; 1b, 1c); the analysis (`nights`, `baselines`, `daily_status`, `insights`, `score_settings` version 2, `analysis_queue`, `events`, `workouts`; Phase 2), with two pg_cron jobs (`run-analysis-queue` every minute, `trim-cron-log` daily). Two accounts (Sabine as owner, and the test account). The project also has Supabase's automatic row-level security for new tables (`rls_auto_enable`), chosen at creation |
| GitHub repository | `sabinejoseph8/Apple-Health`, public; `main` has 1a and the first part of 1b; Phase 1's rest is on `phase-1b-daily-sync` and Phase 2 on `phase-2c-tuning`. GitHub Actions run, on every push: the app (type check, tests, build, secret check), the Shortcut checks, the pandas reference's tests, the database tests, end-to-end tests in WebKit at iPhone size, and the local end-to-end checks (sync, import, and the database matched against the pandas reference) |
| Vercel | Project `clarivi` (Hobby) under `sabine5`, deploying from GitHub: production from `main` at https://clarivi-zeta.vercel.app, a preview for every other branch. Connected to Supabase through the official integration (Production values); preview values and the push public key added by hand (3 October 2026) |

**Settled: Supabase region (2 October 2026).** The first project was created in US West by mistake. It was replaced while still empty by a new project in US East (ref `vuynnnrijdbvamwfauog`), as the plan said. The old US West project (ref `pupxkjhhhgeeoqyvtsst`) is no longer used.

| Phase | Name | Status |
|---|---|---|
| 1 | Spikes: the riskiest unknowns first | In progress (one check left, until about 10 October) |
| 2 | Data and analysis | Done (self-test running) |
| 3 | Readiness card, check-in and Why today | Done (6 October 2026) |
| 4 | Notifications and follow-through | Built, reviewed and live; checks 1 and 2 passed (5 and 6 October), 3 to 5 need a change day |
| 5 | Trends, digest, settings and owner page | Done (4 October 2026) |
| 6 | Hardening and dry run | In progress: steps 1 and 2 done; the dry run dropped (D89); left: freeze, tag and changelog after the self-test, and the code review |
| 7 | Two-week test (Sabine only, D89) | Not started |
| 8 | Results and demo | Not started |

Requirement numbers (R1 to R67) refer to product-spec.md.

---

## Phase 1: Spikes (the riskiest unknowns first)

**Goal:** prove the four things that could force a change of approach before building anything else:
- the iPhone app and push work
- the Shortcut can sync
- a year can be imported
- users' data stays separate

**Status:** In progress (1a, 1c and the Phase 1 code review done on 3 October 2026; 1b's last check, the locked-phone rate, counted until about 10 October from the uploads log plus Sabine's notes, D75)

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
- Vercel's Supabase integration filled in Production only; the Preview values were added by hand. Since 5 October 2026 (D81) the integration is removed and all three public values are set by hand for both.
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
- **A blocked run can now leave no trace (4 October 2026):** the charger run at 10:38am stopped with the Shortcuts message "This shortcut requires privacy permissions that cannot be granted while your device is locked" and never reached the server (no ping). The Shortcut's first step reads the "synced today" file, and the lock blocks that too; on 3 October that file didn't exist yet, which is likely why the blocked runs then still sent their ping. The app automation caught up three minutes later (readings at 10:43am, the night complete at 10:52am), as D16 intends. So the log alone undercounts blocked charger runs (D75).
- Still to measure: the locked-phone rate (check 2), until about 10 October 2026: from the log, which automation delivered each morning's sync and when; plus Sabine's notes of mornings she sees the locked message (D75). Mornings with the locked message so far: 4 October; 5 October and 7 October (as a "Tap to run" prompt). 5 October: the log shows the 5:32am charger run sent its ping and no readings (the 3 October pattern: blocked at the Health read); the 8:52am charger run got through. On 7 October Sabine remembered seeing the "Tap to run" prompt on Monday or Tuesday; Tuesday had no automation run (automations off, then already synced), and the prompt comes only after the ping, so it was the 5:32am run on Monday 5 October, left unanswered. 6 October: left out (both automations switched off for Phase 4's reminder check). 8 October: the 10:27am charger run got through and sent readings (no prompt reported). 7 October: locked, in a new form: the 9:28am charger run started while the phone was locked (Do Not Disturb on), and at its first Health read Shortcuts put a prompt on the lock screen, "Find Health Samples Where: Tap to run", with Cancel and Continue, instead of the "device is locked" message (Sabine's screenshot). After a tap on Continue the run carried on and posted its readings at 9:29am; the 9:33am app run also got through; last night's sleep hadn't reached the iPhone yet, so the night was completed by Sync now at 9:39am (the morning notification followed at 9:41). So the count includes mornings where a locked run waits for a tap: the run is saved only if the person taps Continue.

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
- [x] Build `baselines`: 28-night median and scaled spread, excluding the night judged; 21-valid-night minimum; normal range (the window is a setting: 42 nights from version 2, D59)
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

**Status:** Done (6 October 2026): built, reviewed, live, checked on Sabine's iPhone, and the wording sheet approved after her review. Earlier status: Built, reviewed, live and checked on Sabine's iPhone (4 October 2026; decisions D62 to D65). Left: Sabine's review of the wording sheet (`npm run wording:sheet`), which closes the wording-module task and the phase.

### Tasks
- [x] Add design tokens (colours, type, spacing, radius) from design.md as CSS variables (4 October 2026)
- [x] Build the wording module: briefing parts, verdicts, nudges, state messages and notification text, with rule tests (6 October 2026: wording sheet reviewed and approved by Sabine, with her changes: "in your usual range" and no "normal" on any screen (D85), "Your body needs to rest today", the check-in's "Great / Okay / Off"). Released 6 October 2026 at about 1am, after a backup (53 tables, 132,974 rows): https://github.com/sabinejoseph8/Apple-Health/pull/11 put the new words and the consent text version 2 live; Sabine and the test account agreed to version 2 (1:17am and 1:18am); then `npx supabase db push` applied `20261014000000_consent_v2.sql`, and both have consent in force; Sabine checked the new wording in the live app and approved it
- [x] Build the daily check-in screen (good, okay, off, Skip) and the check-in row on the card (4 October 2026)
- [x] Build the readiness card (4 October 2026):
  - header, status pill, briefing card, nudge block, Why link and digest row
  - the morning layout
  - every no-status and partial state (R25 to R34). From Phase 2: `daily_status` gives `night_unfinished` on today when a sync came but the night hasn't arrived, which the card shows as "sleep still in progress" before noon and "not enough data" after; "waiting", "no sync" and "late" are worked out by the card from the clock and the last sync
  - "Sync is being rejected" with a link to Settings (R11), and import progress ("Importing your history: 5 of 12 months", R12) (D64)
  - until Phase 5, the Settings button opens the temporary account screen, and the weekly digest row is left out (D63)
- [x] Build Why today (4 October 2026):
  - summary card, three reading cards with mini charts and "Show the numbers"
  - "Also checked"
  - "How today's status is decided" with the points table and zone boxes (zone numbers and the "last 42 nights" footnote come from the active score settings, version 2: 1.2 and 2.4; the design canvas still shows the placeholders 1, 2 and 28; users can't read the settings table, so a small database function gives the app a version's zone limits and normal window, never the weights, D62)
  - no "See your trends" button until the trend view exists (Phase 5, D63)
  - missing and building states
- [x] Log card views and Why today opens (4 October 2026: `usage_events` through `log_usage`, never health values; skipped check-ins too)
- [x] Check safe areas and the one-screen fit on 390-point iPhones (4 October 2026: tested at 390 by 763 points, and on Sabine's iPhone the card fits one screen with the date clear of the status bar)
- [x] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests (4 October 2026, before release: 10 findings, 8 fixed, 1 no change, 1 decided by Sabine, D65; all tests re-run and pass)

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

**Status:** Built, reviewed and live (4 October 2026: database and sender released, app merged through https://github.com/sabinejoseph8/Apple-Health/pull/2). Manual check 1 (morning push) passed on 5 October 2026: the charger run at 5:32am was blocked by the locked phone; the 8:52am and 8:55am syncs came before the Watch's sleep record reached the iPhone, so the night stayed unfinished and no notification went out (as designed); once the night was in Health, the app automation's 9:28am sync completed it, the status was worked out, and the notification was queued at 9:29, delivered to her one device at 9:30 and tapped, opening the card (check-in first); the card and the notification both recorded what was shown. Manual check 2 (the 11:30 reminder) passed on 6 October 2026: with both automations off overnight, the reminder was queued at 11:30, delivered to her one device at 11:31 with no health detail and tapped at 11:32; Sync now at 11:33 (Shortcuts first asked to "Allow Clarivi Sync to output 1 text item?", answered Always Allow) completed the night, the morning notification followed at 11:35, and the card showed Ready with the grey Late pill; both automations were switched back on. Left: checks 3 to 5, which need a change day and the next morning; the tasks are ticked as they pass (the planner's task waits for the 8pm part). Planned 4 October 2026 (decisions D66 to D69), built on branch `phase-4-notifications` (from `phase-3-card`) in three steps: 1, the database (outbox, morning queueing, the 5-minute planner, what was shown, follow-through answers); 2, the sender (due notifications every minute, delivery and tap logging); 3, the app (the 8pm card, next-morning carry-over, notification health). Released after Phases 1 to 3 merge into `main` (D69).

### Tasks
- [x] Build the notification outbox, with one notification of each kind per user per day (5 October 2026: one morning notification on the first real morning)
- [x] Queue the morning notification after analysis (status and reason; none on days without a status) (5 October 2026: none while the night was unfinished, queued a minute after the complete night arrived)
- [ ] Build `plan_notifications()` every 5 minutes: 11:30 reminders and 8pm follow-ups by each user's local time
- [x] Build the sender schedule and delivery, failure and tap logging (5 October 2026: sent within a minute to Sabine's one device, the tap logged)
- [ ] Build the 8pm card state: follow-through card with equal Yes and No, folded briefing, recorded states with Change
- [ ] Build next-morning carry-over for unanswered questions
- [ ] Show notification health on the card and in Settings
- [x] Add the late-sync marking (11:30 to noon) and the no-sync-by-noon state (6 October 2026: a Sync now at 11:33am gave Ready with the grey Late pill; the no-sync-by-noon card is covered by the screen tests)
- [x] Keep, for each user and day, the status, nudge and reason that were shown (5 October 2026: recorded by the notification and the card): when the morning notification is sent and when the card is first opened, saved permanently; the test's Signal and Action results use this record, since recalculation may later correct a past day (D61, from the Phase 2 code review)
- [x] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests (4 October 2026, before release: 9 findings, all fixed; all tests re-run and pass)

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

**Status:** Done (4 October 2026): built, reviewed, released, merged into `main`, and all five manual checks passed on Sabine's iPhone. Planned 4 October 2026 (decisions D70 to D74), built on branch `phase-5-settings` (from `main`) in three steps: 1, Settings (notifications, upload token, change password, sign out everywhere, delete my data); 2, the trend view and the weekly digest; 3, the owner page and the password reset.

### Tasks
- [x] Build the trend view: one chart per score reading, last 8 weeks, normal-range band, flagged nights, gaps (4 October 2026)
- [x] Build the weekly digest job (Monday 5am local) and page, including the "first digest" and missing-days states (4 October 2026)
- [x] Build Settings (4 October 2026; the setup guide link comes in Phase 6, D73; sign out everywhere also stops notifications to every device):
  - notifications status
  - upload token create and reissue (password check)
  - setup guide link
  - change password
  - sign out everywhere
  - delete my data (password check and confirmation)
- [x] Build `owner-status` and the owner-only page: last sync, reminder days, delivery failures, import progress, project activity (4 October 2026)
- [x] Write the owner admin script to reset a password and set the change-password flag (4 October 2026: `owner_data.py reset-password`, through the owner-only `owner-reset-password` function, D74)
- [x] Write the events loader script (built in Phase 2c: `scripts/reference/owner_data.py load-events`, from `private/events.csv`)
- [x] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests (4 October 2026, before release: 10 findings, 9 fixed, 1 known limit; all tests re-run and pass)

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

**Goal:** make the app safe and ready for testers, then prove it with one tester for a week. (D89, 8 October 2026: Sabine is the only tester, so the fit check on testers' iPhones and the dry run with a tester are dropped; the card's fit was checked on her iPhone in Phase 3, and her two weeks are the test.)

**Status:** In progress (5 October 2026): step 1 done and live; step 2 done and live (the icon, guide, Shortcut link, data protection check, in-app consent with Withdraw consent and "Your data", Sync now, and the key work D81), except the fit on testers' iPhones; the dry run is prepared and waits on a tester. Planned 4 October 2026 (decisions D76 to D79; D80 to D82 decided the same evening), built on branches `phase-6-hardening`, `phase-6-step-1-done`, `phase-6-consent` and `phase-6-consent-screen` in three steps: 1, safety (the Content Security Policy, the secrets review, the live row-level security and upload-path checks, the first backup and a practice restore); 2, ready for testers (the app icon, the setup guide, Shortcut template v1, the Cayman Data Protection Act check, in-app consent, the fit on testers' phones); 3, the one-week dry run with one tester, then the release. Steps 1 and 2 need no tester; step 3 needs a tester's account and their consent. 8 October 2026: the code review is done (D89 dropped step 3's dry run); the freeze, tag and changelog wait until after Sabine's self-test.

**Choosing testers (4 October 2026):** every tester needs Watch sleep history (at least 21 tracked nights, ideally months, so they have a status on day one) and must wear the Watch to bed with sleep tracking on: each night is built from the Watch's sleep record, which HRV and sleeping heart rate are measured within too. Without history a tester spends about three of the four weeks on "Learning your normal", with no status, morning notification, nudge or 8pm question. One planned tester has no sleep history and won't take part; Sabine is finding a replacement, so the test stays at four people. The setup guide asks each tester to check Health, Browse, Sleep first.

**Step 1 progress (4 October 2026):**
- **Content Security Policy:** built. `vercel.json` sends a strict policy on every page and file (only the app's own code; connections only to itself and the live project; no framing, plugins or referrer) and other safety headers. `csp.test.ts` checks the policy; `e2e/csp.spec.ts` serves a production build with the same headers (the made-up database in place of the live project) and fails on anything blocked or any request to another site, shown to work by adding an inline script, which failed the test. Sabine looked through the preview on her iPhone; merged into `main` through https://github.com/sabinejoseph8/Apple-Health/pull/7 (its merge already carries her private GitHub address), the production headers were checked and the Home Screen app works under them.
- **Secrets review of the whole history (108 commits, all branches):** no keys, passwords, database addresses with passwords, `.env` files, health exports, backups or data files; the only key-like text is the made-up key planted to prove the build's secret check; the old MVP PDF (in history only) holds no email address or readings; the test account's email and Sabine's Apple relay address appear nowhere. The function secrets (secret keys, VAPID private key) are only in Supabase's secret store (`npx supabase secrets list` shows names and fingerprints only), and the app reads only its three public values.
- **Found and fixed: Sabine's personal email on six merge commits.** GitHub stamps "Merge pull request" with the account's main email when email privacy is off. Sabine turned on "Keep my email addresses private" and "Block command line pushes that expose my email", then chose to rewrite history: the six merges now carry her private GitHub address (every commit's files checked identical), `main` and `phase-6-hardening` were force-updated, and the four merged branches that still held the old merges (`phase-5-settings`, `phase-5-checks`, `phase-5-done`, `phase-1-locked-count`) were deleted. GitHub still keeps its own copies through merge requests #3 to #6 until GitHub Support removes them (Sabine sent the request on 4 October 2026).
- **First backup and practice restore:** done. Sabine made the encrypted disk image (`hdiutil create ... -encryption AES-256`, `~/ClariviBackups.sparsebundle`, outside Documents and iCloud; its password only in her Passwords app, not in the keychain, D77). `scripts/backup-live.sh` saved roles, schema and every row (sign-in accounts included) into a dated folder in the image, refusing any other place: 52 tables, 132,638 rows. `scripts/restore-local.sh` loaded it into the wiped local copy after the migrations and matched every table's row count; a deliberately wrong count fails it. The local copy was wiped again afterwards (no accounts, readings or uploads left). Both scripts were first tested on the local copy's made-up data. Weekly reminder: a repeating event in Sabine's Calendar, "Clarivi: weekly backup", Sundays at 7pm from 11 October 2026, with the three commands in its notes; it syncs to her iPhone.
- **Live privacy checks:** done. The database catalog (`scripts/live-privacy-catalog.sql`, read-only): all 19 tables have row-level security; signed-out visitors can read, write and run nothing; signed-in people write no table directly and may run only the 11 functions meant for them, each limited to their own data or to the owner; every function that runs with its owner's rights has a fixed search path; no storage buckets. From the outside (`scripts/reference/privacy_check.py`, run by Sabine in Terminal as the test account): 110 of 110 passed. On the local copy it also passes, and fails as it should when a deliberately unprotected table is added (`--prove`); both run on every push.

### Tasks
- [x] Turn on a strict Content Security Policy; confirm there are no third-party scripts (4 October 2026: live through https://github.com/sabinejoseph8/Apple-Health/pull/7; the production headers checked, the page loads only its own files, the live sign-in screen shows nothing blocked, and Sabine's Home Screen app works under it)
- [x] Review secrets: none in the repository, the secret key only in server functions (4 October 2026: the whole history is clean; Sabine's personal email removed from six merge commits)
- [x] Re-run every row-level security and upload-path test against the live project (4 October 2026: the catalog check, and `privacy_check.py` as the test account, 110 of 110)
- [x] Make the first `db dump` backup to an encrypted disk image outside Documents and iCloud (D77); practise one restore on the local copy (4 October 2026: 52 tables and 132,638 rows backed up, restored on the local copy with every count matching, then the local copy wiped)
- [x] Check the Cayman Data Protection Act's rules for health data and storage in the US, and whether a recorded in-app agreement is enough consent (a short summary with sources; not legal advice). 4 October 2026: approved by Sabine; researched in `docs/cayman-data-protection.md`, with the rules where testers may live (Ontario, Quebec, Washington, DC; build to Quebec's, the strictest), with the privacy contact chosen by Sabine (notions_close_5p@icloud.com, a Hide My Email address just for Clarivi, public by design), waiting for Sabine to read it and decide its other suggestions (explicit wording, separate US-storage agreement, how to withdraw, the breach plan, a privacy impact assessment and a named person in charge with a public contact address for Quebec, a published privacy policy, testers who depend on her, Vercel's copies of the secret values)
- [x] Build in-app consent (D79). Released 5 October 2026 (after a backup: 52 tables, 132,946 rows): `npx supabase db push` applied `20261012000000_consents.sql` and `20261013000000_sync_button.sql` (checked: row-level security, no direct writes, only signed-in people can agree, only the server can withdraw), `npx supabase functions deploy` published the functions, and https://github.com/sabinejoseph8/Apple-Health/pull/10 put the app live; Sabine agreed in her Home Screen app at 10:02am and the test account at 10:04am; the live privacy check passed 119 of 119. Built: the `consents` table and functions (migration `20261012000000_consents.sql`), `account-withdraw-consent`, `account-token` and `ingest` refusing without consent, the consent screen before anything else (two unticked statements; "I agree" needs both; Sign out), the public "Your data" page at `#/privacy` linked from the guide and Settings, and Settings' "Your consent" card (the date agreed, the text, Withdraw consent). Tested: 24 pgTAP checks, the Deno reply test, 8 screen tests, 6 more local account steps, and the privacy check (119 of 119 on the local copy). At release, Sabine's and the test account's uploads are refused until each agrees in the app, so release after her morning sync and agree straight away. Originally: the consent text in the wording module (what is collected, storage in the US, who can see it, lock-screen visibility, deletion 90 days after the test or on request, not medical advice), the screen after first sign-in, the recorded agreement, no upload token or upload before it, and the date in Settings; a "Withdraw consent" row in Settings that deletes everything after the password, records the withdrawal and asks for consent again on next use (D80); Sabine reviews the text
- [x] Replace the placeholder app icon with the open ring and dot (D76) (4 October 2026: drawn by `scripts/make-icons.py`, live through https://github.com/sabinejoseph8/Apple-Health/pull/8, in deep violet since https://github.com/sabinejoseph8/Apple-Health/pull/9; a phone that already has the app keeps the old icon until the app is added again)
- [x] Write the one-page setup guide as a public page in the app, linked from the sign-in screen and Settings (D78, D73). 4 October 2026: approved by Sabine on her iPhone; built at `#/guide` (`src/screens/Guide.tsx`, words in `wording.guide`), opening without sign-in; "How to set up Clarivi" on the sign-in screen; "Get the Clarivi Shortcut" and "Setup guide" rows in Settings' Upload token card (R10); eight numbered sections; tested in `e2e/guide.spec.ts` and under the security headers. It is checked for real in the dry run, and its consent step lands with the consent screen (home screen, sign-in, notifications, Shortcut, token, import, automations, "When Unlocked", who to contact). From the 1b spike: turn on Settings, Apps, Shortcuts, Advanced, "Allow Sharing Large Amounts of Data"; run Clarivi Sync by hand once and allow Health and file access (automations can't ask for permission); ask whether they use a third-party sleep app (sleep has no source in Shortcuts, so Watch sleep is recognised by its stages); ask about long trips in the past year (D46: part of those trip nights' heart rate is lost in the import, and Phase 2 marks them as travel days); build each automation from the Automation tab (iOS 27 shows it as "When ... is Opened"/"When power Disconnects"), with a Text action holding exactly `charger` or `app`, then Run Shortcut with that Text as input
- [x] Remove Vercel's Supabase connection and its secret copies; type the public values in by hand; replace the Supabase secret key, the database password and the token-signing secret (D81). Done 5 October 2026: the two public values (project address, publishable key) were extended to Production in Vercel by hand and the app republished; Vercel's Supabase integration was removed, which took its 16 copied variables with it (it held no Supabase resources); a new secret key named `functions` was created and the old `default` one deleted (the functions picked it up by themselves, D81's `pickKey`); the database password was reset; the legacy `anon` and `service_role` keys were disabled; and the legacy HS256 signing secret was revoked. The project had in fact signed sign-in passes with an ECC P-256 key since it was set up; the legacy secret was only still trusted, as a previously used key, which is why it mattered. Checked after each step; the live privacy check passed 119 of 119 afterwards.
- [x] Publish Shortcut template v1 (blank, asks for the token at install) as an iCloud link from the Shortcuts app, in Settings and the guide (D78, refined). 4 October 2026: the link is made from a fresh blank copy ("Clarivi Sync template", token answered with a placeholder) and checked: its page and both files name no one and hold no email, the token step is empty and its one install question asks for the tester's own token, and Apple approved it; live in Settings and the guide through https://github.com/sabinejoseph8/Apple-Health/pull/8, seen by Sabine. It installs as "Clarivi Sync template": the Shortcuts app won't give it the plain name while Sabine's own Clarivi Sync has it, and her own is left alone because her automations use it. The card's no-sync message says "run Clarivi Sync", so Sabine decides its words in the wording review
- Dropped 8 October 2026 (D89): the one-week dry run with one tester, and the fit check on each tester's iPhone. Was: Run a one-week dry run with one tester; fix what breaks. Prepared and approved by Sabine 5 October 2026: `docs/dry-run-checklist.md` (choosing the tester, making the account, what to send, the setup call, what to watch each morning, the end-of-week questions). Includes the tester-phone parts of 1b and 1c (D44, D45): both automations on their phone, the locked-phone rate, the sleep stages from their Watch, and timing their one-year import (the setup guide says: if the import stops part-way, run it again; it carries on from the last finished month)
- [ ] Freeze the score settings; tag the release; write the changelog (a first draft of v1.0.0 in `CHANGELOG.md`, approved by Sabine 5 October 2026)
- [x] Code review of everything changed in this phase; fix what it finds, then re-run this phase's automated tests (8 October 2026: 10 findings. Fixed: past days without a status said "no status today" and "last night", and, with Sabine's approved words, every past-day screen now says "that night", "that day" and "the previous day" (the nudge keeps the words that day had); the Setup guide link could lose a just-made upload token, so it waits while the token shows; the no-sleep-stages card kept checking every minute after noon; opening the guide or "Your data" from Settings restarted the signed-in app; an impossible date in a past-day address broke the page; Back after stepping between days opened from a link; the reference today script lacked the no-sleep-stages line; ten hand-written in-app links now share `AppLink`. Left with Sabine's OK: `consent_version()` is marked immutable though it changes between releases (harmless now; fixing it needs a live database change, so it waits for the next release, see Phase 8), and the past-day screen's one small extra read of the first day. Re-run: unit 94, database 392, functions 58, reference 31, end to end 110, all passing)

### Automated tests
- The full suite passes on the release tag: database, functions, front end and end to end.
- The CSP check: the page loads no outside scripts.
- Consent (D79): before agreeing, a person can't make an upload token and the server refuses their uploads; the agreement records the text's version and time, and only its owner can read it.

### Manual verification
1. **Restore:** restore your latest backup into the local copy.
   *Expected:* every table and row is present.
2. **Consent:** sign in for the first time on a new account.
   *Expected:* the consent text comes first; nothing else opens until "I agree"; Settings then shows the date agreed.

---

## Phase 7: Two-week test

**Goal:** run the test exactly as agreed, with no changes to the score.

**Status:** Not started. Changed 8 October 2026 (D89): Sabine is the only tester, and the test runs two weeks instead of four; the tasks for onboarding testers and holding the testers' end-of-test conversations are gone.

### Tasks
- [ ] Check the owner page every morning; follow up on any missed sync the same day
- [ ] Back up at least weekly and before any database change
- [ ] Make no changes to score logic or settings during the test
- [ ] At the end, write your own short account: did Clarivi change a decision, what you ignored and why, whether you'd keep using it (in place of the testers' conversations, D89)
- [ ] Decide after the test whether to move the project to Supabase Pro (daily backups, the 30-day inactivity sign-out)
- [ ] Code review of anything changed during the test (fixes only; score logic stays frozen); fix what it finds, then re-run the full test suite

### Manual verification
1. **Daily:** check the owner page.
   *Expected:* the morning synced, or the cause is known that day.
2. **Weekly:** check the backup folder.
   *Expected:* a backup no more than 7 days old.
3. **End:** check that both weeks are complete.
   *Expected:* 14 days of data.

---

## Phase 8: Results and demo

**Goal:** judge the test against the agreed targets and prepare the two-layer demo.

**Status:** Not started

### Tasks
- [ ] Calculate every target:
  - sync on 13 of 14 days
  - notifications delivered on 90% of days with a status
  - isolation
  - correctness
  - Signal on your year
  - quiet by default
  - your check-ins against your status, on days with a status
  - engagement
  - action
- [ ] Report partial-data days separately, and your check-in completion rate
- [ ] Bring your own end-of-test account into the results and the demo
- [ ] Build the main demo story: one week from your data where the tool flagged something early, starting from Apple Health's plain numbers
- [ ] Build the appendix: arithmetic, trends, the SQL-versus-pandas check, the disrupted-day check, every target and its result, limitations, and the causal layer as a worked method
- [ ] Review D86 with Sabine: whether nights the Watch records without stages should count toward the status (asked for by Sabine, 8 October 2026; look at how often such nights came during the test)
- [ ] Mark `consent_version()` stable instead of immutable, in the next release's database change (Phase 6 code review, 8 October 2026; left until after the test with Sabine's OK, as it needs a live database change and does no harm now)
- [ ] Code review of everything changed in this phase; fix what it finds, then re-run the full test suite
