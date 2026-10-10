# Tech Spec: Clarivi

**Status:** Agreed, v1.0 (30 September 2026)
**Last updated:** 10 October 2026 (database tests must not name a day that can become today; 9 October: Supabase Pro, D90: daily backups, no pausing, the 30-day inactivity timeout on, 8 GB on the owner page. 8 October: the Phase 6 review: in-app links share `AppLink`, `whySummary` and `alsoChecked` take a past-day switch, and the guide and "Your data" open inside the signed-in app; Sabine the only tester for a one-week test (D91; first two weeks, D89); past days at `#/day/<date>`, D88; `no_sleep_stages`, D87; `night_complete` counts only the Watch's sleep stages, D86; earlier, 6 October: redeploy the functions whenever `_shared/` changes (Deployment, step 5); the consent text is version 2 (D85); earlier, 5 October: the consents release, `run_trigger` value `button` for Sync now (D84), D81 done: Vercel holds only the three public values, the secret key replaced, the legacy keys disabled and the legacy signing secret revoked; earlier, 4 October: Phase 6: the security headers, the privacy check from the outside and its catalog check, backups as built and the restore steps, the consents table and its functions, `account-withdraw-consent`, the consent checks in `account-token` and `ingest`, the key helper ready for D81, and the data protection research; earlier the same day: Phases 3 to 5 built, reviewed and live, including the Phase 5 fix that makes "Sign out everywhere" also stop notifications to every device; earlier: Phase 1a built and live; Phase 1b upload path built and live, with the column post format (D42) and the server-side heart-rate window (D43), recorded in sections 3 to 10; Phase 2a nights, normals and the analysis queue built, with the night rules of D48, D49 and D50; Phase 2b score settings, daily status and insights built, with D51 to D53; Phase 2c events, workouts and the reference check built, and the final score numbers set (version 2, frozen), with D54 to D60; Phase 2 code review fixes and D61; Phase 3 step 1: check-ins, usage log, zone numbers (D62) and the briefing builder; Phase 3 steps 2 and 3: the card, check-in and Why today, how the app reads, and the screen tests)
**Builds on:** product-spec.md (Agreed, v1.0), design.md (Agreed, v1.0), mvp.md
**Builder:** Claude Code, into a repository Sabine owns

Requirement numbers (R1 to R67) refer to product-spec.md. Anything marked **Default** is a proposal waiting for your agreement.

---

## 1. Architecture overview

The app has three main paths: readings flow in, results are worked out on the server, and the app reads them back.

```
iPhone Shortcut ──POST readings──▶ Ingest function ──▶ Raw readings (database)
                                                          │
                                         analysis queue ◀─┘
                                                          ▼
                                   Analysis (SQL, run by a scheduler)
                                                          ▼
                       Results: nights, baselines, daily status, insights
                                     │                         │
                     notification outbox                 read by the app
                                     ▼                         ▼
                   Push sender function ──▶ Apple push ──▶ iPhone web app
```

**Main parts**

1. **iPhone Shortcut**
   - Reads Apple Health on each phone and posts the raw readings.
   - Runs on two morning automations, plus a one-time import of 12 months.
2. **Ingest function**
   - The only way data gets in.
   - Checks the upload token, validates and stores raw readings without duplicates, and queues analysis.
3. **Database**
   - Holds raw readings (never changed), results that can always be rebuilt from them, user answers and logs.
   - Every table is locked to its owner by row-level security.
4. **Analysis** (SQL functions)
   - Turns raw readings into nights, baselines, the daily status, the nudge and insights.
   - Runs from a queue every minute, so an upload never waits for it.
5. **Schedulers** (inside the database)
   - Run the analysis queue every minute.
   - Trim the job log daily (built in Phase 2: `trim-cron-log`, keeps 7 days).
   - Plan the 11:30 reminders and 8pm follow-ups every 5 minutes, using each user's local time.
   - Build weekly digests once a week.
6. **Push sender function**
   - Sends queued notifications through Apple's web push service, and records delivery and failures.
7. **Web app**
   - Static files on Vercel, installed to the iPhone home screen.
   - The browser talks to the database directly, so health data never passes through Vercel.
8. **Reference check**
   - A local pandas notebook that recalculates the owner's year independently, to prove the SQL is right.

---

## 2. Technology choices

| Area | Choice | Reason |
|---|---|---|
| Front end | React + TypeScript, built with Vite as a single-page app | Static files only, so the host never handles health data |
| Styling | Plain CSS with design tokens as CSS variables | Tokens map one to one onto design.md |
| Installable app | Web app manifest plus a hand-written service worker | Needed for home-screen install and web push on iPhone (iOS 16.4 and later) |
| Charts | Small SVG components written in the app | The charts are simple; this matches the design exactly with no extra library |
| Front-end hosting | Vercel (Hobby plan) | Already decided; free for personal, non-commercial use; preview address per change |
| Backend platform | Supabase: Postgres, Auth, Edge Functions, scheduler (pg_cron) and outbound calls (pg_net) | One platform for data, login, functions and schedules |
| Analysis | SQL functions (window functions, medians) | Already decided; rules stay inspectable and recomputable |
| Server functions | TypeScript Edge Functions (Deno) | Same language as the front end; runs next to the database |
| Input checking | zod schemas, shared by the app and the functions | One definition of valid data, used everywhere |
| Web push | VAPID keys with a Deno web push library (`@negrel/webpush`; fallback `npm:web-push`) | No third-party notification service needed |
| Tests | Vitest, Playwright, pgTAP (database tests through the Supabase CLI), Deno test, pandas | Each layer tested in its own tool |
| Local development | A local copy of Supabase run by the Supabase CLI (needs Docker on your laptop), also used in CI | Gives a safe place to build and test database changes, since there is only one live project |
| Code and checks | GitHub repository with GitHub Actions running all tests on every push | Vercel deploys from GitHub; failures are caught before release |
| Database changes | Supabase CLI migrations kept in the repository | Each change is built and tested on a local copy of Supabase first, then applied to the one live project |

---

## 3. Data model

All times are stored in UTC, with the phone's timezone offset kept beside them. Every table has a `user_id`, and row-level security limits each user to their own rows.

**Accounts and access**
| Table | Holds | Key fields |
|---|---|---|
| `profiles` | One row per user | `user_id`, `display_name`, `is_owner`, `latest_tz_offset_min`, `watch_model`, `created_at` |
| `upload_tokens` | Shortcut tokens | `id`, `user_id`, `token_hash` (SHA-256), `created_at`, `last_used_at`, `revoked_at` |
| `push_subscriptions` | One per device | `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at`, `last_seen_at`, `revoked_at` |

The first-login password change is tracked by a flag in the login system's admin-only metadata (`must_change_password`), so users can't clear it themselves.

Built in Phase 1a (3 October 2026):
- A trigger creates each `profiles` row when an account is created, and copies the owner flag from admin-only metadata (`is_owner`) whenever it changes.
- `push_subscriptions.endpoint` is unique. A phone belongs to whoever signed in on it last: signing in as another account moves the phone's notifications to that account, so a shared phone never shows the wrong person's notifications (decided by Sabine, 3 October 2026; product-spec.md).
- Signed-in users can only read their own rows. Direct inserts, updates and deletes are revoked; rows change only through the trigger and named functions such as `register_push`. Since the Phase 1 code review, signed-in users have only SELECT on every table (TRUNCATE, TRIGGER and REFERENCES were also revoked from the 1a tables, as TRUNCATE ignores row-level security).
- Signing out first unsubscribes this phone from notifications, so a signed-out person's status never appears on its lock screen (Phase 1 code review).

**Raw data (never changed after arrival)**
| Table | Holds | Key fields |
|---|---|---|
| `uploads` | One row per post | `id`, `user_id`, `token_id`, `received_at`, `schema_version`, `kind` (daily, backfill, ping), `month_id`, `run_trigger` (charger, app, manual), `device_tz_offset_min`, `local_date`, `sample_count`, `duplicate_count`, `night_complete`, `set_aside_count`, `set_aside_note`, `status` (accepted, rejected), `error` |
| `samples` | Every reading | `id`, `user_id`, `upload_id`, `type` (heart_rate, hrv_sdnn, sleep_stage, resting_hr, respiratory_rate), `start_at`, `end_at`, `tz_offset_min`, `value`, `unit`, `stage`, `source_name`, `source_device`, `sample_hash` (unique per user) |
| `workouts` | Owner only, for the Signal check | `id`, `user_id`, `activity`, `start_at`, `end_at`, `tz_offset_min`, `duration_min`, `avg_hr`, `source_name` |

Built in Phase 1b (3 October 2026):
- `upload_tokens`: at most one working token per user (a unique index on unrevoked tokens). The app can read when its token was made and last used, but never the hash (column-level grants).
- `uploads.run_trigger` is `charger`, `app`, `manual` or, from 5 October 2026, `button`: the card's Sync now link (`shortcuts://run-shortcut?name=Clarivi%20Sync&input=text&text=button`, D84) passes "button" as the Shortcut's input, which skips its sync-or-import question (migration `20261013000000_sync_button.sql`; `TRIGGERS` in `_shared/ingest-schema.ts`).
- `uploads` also logs rejected posts from a known token (a replaced token, or a body the function refused, with the reason), so a broken Shortcut shows up in the log. `run_trigger`, `local_date` and `night_complete` were added to measure locked-phone runs and answer "already synced today?". A run blocked by a locked phone at its first step (reading the "synced today" file) never reaches the server, so the locked-phone count adds the owner's notes (D75, 4 October 2026).
- `samples.sample_hash` is a SHA-256 of the type, start, end, value, stage and source. The time zone isn't part of it, so the same moment posted from another time zone is the same reading. Heart rate is stored only from 6pm to noon, by each reading's own local time (D43). Sleep readings arrive with no source: Shortcuts doesn't report one for sleep (Phase 1b), so Watch sleep is recognised by its stages (core, deep, REM, awake) for D10.
- All writes go through two database functions callable only with the secret key: `ingest_upload(token_hash, upload, error)` and `issue_upload_token(user, token_hash)`.

**Results (always rebuildable from raw data)**
| Table | Holds | Key fields |
|---|---|---|
| `nights` | One row per user per night | `night_date` (local date of waking), `sleep_start`, `sleep_end`, `asleep_min`, `finished`, `sleeping_hr` (median while asleep), `hrv_median`, `hrv_count`, `resp_rate`, `resting_hr_prev_day`, `coverage`, `confidence` |
| `baselines` | Per night and reading | `night_date`, `metric`, `median_28`, `mad_scaled`, `valid_nights`, `range_low`, `range_high`, `building` |
| `daily_status` | The answer for each day | `date`, `status` (ready, ease_off, rest, none), `no_status_reason` (waiting, night_unfinished, no_sync, not_enough_data, learning, no_sleep_stages), `readings_used`, `points` (per reading), `total`, `nudge`, `reason_codes`, `composite_fired`, `composite_inputs`, `is_late`, `settings_version`, `computed_at` |
| `insights` | The shared module output | `date`, `module`, `metric`, `value`, `baseline`, `deviation`, `severity`, `explanation_code`, `payload` |
| `digests` | Weekly summaries (built in Phase 5: one row per person and week, the facts only; the app writes the sentences) | `week_start`, `facts`, `created_at` |

Built in Phase 2a (3 October 2026):
- `nights` follows the D48, D49 and D50 rules: time asleep is the time covered by an asleep stage (core, deep, REM) and by no awake stage, each moment counted once, so overlapping records (a second app's stages, or the same stretch recorded as asleep and awake) are never counted twice (D49); a night is all the time asleep in stretches starting from 6pm the evening before to noon, by the local time of the stage each stretch starts in, dated by that morning, however long the breaks (D50); it needs at least 2 hours asleep; stretches starting from noon to 6pm are naps; sleeping heart rate is the median of the readings taken while asleep and needs at least 10 (D48). Also kept: `tz_offset_min` (of the night's last stretch asleep), `sleeping_hr_count` and `resp_count`. `finished` means the sleep ended at least 10 minutes before the user's last accepted upload. `coverage` is the share of the asleep time, in 15-minute blocks, that has a heart rate reading; `confidence` is high from 0.7, medium from 0.4, otherwise low. HRV and breathing rate are medians of the readings overlapping the sleep window (first to last moment asleep, which can include long awake spells); `resting_hr_prev_day` is Apple's value for the local day before waking.
- `baselines` has one row per night and metric (`sleeping_hr`, `hrv`, `sleep`, `resp_rate`, `resting_hr`), from the nights in the 28 days before it (D11).
- Signed-in users can read their own `nights` and `baselines`; nobody writes to them directly. `analysis_queue` is internal (row-level security on, no policy).
- One function rebuilds everything: `recompute(user, from, to)` rebuilds the nights in the range, then the normals up to 28 days further on (a night's normal depends on the 28 before it). Callable only with the secret key. Running it twice gives the same result.
- `ingest_upload` queues work for every daily post, and for every import post that stored something new, covering the dates of its readings. `run_analysis_queue()` runs every minute (pg_cron), merges each user's pending work into one date range and recomputes once. While an import is arriving (an import post in the last 2 minutes), that user's work waits, so an import is recomputed once at the end. Only daily work is marked to notify (`send_push`); the outbox arrives in Phase 4.
- Sleep records can overlap in a real year (Sabine's: 18 of 239 nights, found on the first live build), and sleep has no source to tell them apart by, so the Watch-only rule for sleep (D10) can't be enforced by source; D49 handles overlaps instead. Time asleep is worked out with Postgres multiranges (`range_agg`, then the asleep ranges minus the awake ranges).
- Each night's readings are looked up on their own through the (user, type, end time) index. A first version joined all nights' readings in one query, and the database repeated that work for every night: 23 seconds for a made-up year. Now a year takes about 0.2 seconds on the local copy, whether or not the database's statistics are up to date.

Built in Phase 2b (3 October 2026):
- `score_settings`: versioned; exactly one version is `active` (a unique index); a `frozen` version can't be updated or deleted (a trigger). Version 1 holds the starting numbers: weights HRV 0.40, sleeping heart rate 0.35, sleep 0.25; Ease off from 1, Rest from 2; normals from 28 nights with 21 valid; `per_metric_overrides` for a reading's own window, minimum and (HRV) `min_count`, the fewest readings in a night for it to count (1 until Phase 2c); `min_spread` per reading (D51); the illness check's 1 spread and 3 markers (D53); `partial_cap` null (no cap). Internal only: row-level security on with no policy, so users never see the weights (R40).
- `rebuild_baselines` reads its window, minimum and smallest spread from the active settings, so Phase 2c can change them with a new version and a recompute.
- `daily_status`: one row per day with a night or a morning sync. `points` holds, per score reading, the value, normal, range, verdict (below, above, in_range, missing, building), spreads worse than normal, points and whether it was counted, never the weights. `total` is the sum of the counted readings' points, each reading's weight shared out over the readings counted (D35). No status (`none`) with `night_unfinished`, `learning` (two or more normals building, D36) or `not_enough_data` (two or more readings missing or building, or no night). `nudge` follows D52; `reason_codes` lists the counted readings that earned points, most first, as `<reading>_outside_range` or `<reading>_worse_than_normal`; `composite_fired` is null when the illness check couldn't run, and `composite_inputs` lists the markers it had (D53). `waiting`, `no_sync` and `is_late` are kept for the card and notifications (Phases 3 and 4), which know the clock and sync times.
- `insights`: per day, each of the five readings against its normal (`readiness` for the score readings, `also_checked` for breathing rate and resting heart rate) with a signed `deviation` in spreads, and the illness check (`illness_check`, metric `pattern`: fired, clear or not_run, with the markers it had and the ones that moved). Users read their own; nobody writes directly.
- `recompute(user, from, to)` now rebuilds nights, then normals and the status up to the longest normal window further on, and returns the three counts. The every-minute queue is unchanged.
- Statistics: right after a large import, or a reset of the local copy, the database has no counts for samples and can choose very slow plans. Each night's stages and each day's readings now go into small indexed temporary tables first; a made-up year recomputes in about 0.2 seconds either way.

Built in Phase 2c (3 October 2026):
- `events` (one row per day: illness, major_event or travel, a short note, source manual or detected) and `workouts` (owner only; unique on user, activity and start). Users read their own rows; nobody writes directly. The owner replaces hers with `replace_my_events(list)` and `replace_my_workouts(list)`, which work out the user from the session and refuse anyone who isn't the owner, so loading needs no secret key.
- `scripts/reference/owner_data.py` turns the Health app export into `private/workouts.csv` (D54) and loads `private/events.csv` and the workouts, signed in as the owner (email and password typed at the prompt, never stored). `private/live.env` holds the live address and publishable key for these scripts.
- Final score numbers (D59): `score_settings` version 2 is active and frozen (normals from 42 nights with 21 valid; Ease off from 1.2, Rest from 2.4; everything else as version 1, which is kept, frozen and inactive). A frozen version's numbers can't change, but which version is active can, so a later version could still replace it before the test.
- Phase 2 code review (3 October 2026): a day with a morning sync but no night yet is `night_unfinished` on the user's current local day (from `profiles.latest_tz_offset_min`) and `not_enough_data` on earlier days; the card turns the first into "not enough data" after noon (Phase 3). `analysis_queue.attempts`: failed work goes back to pending and is tried up to 3 times before `failed`. `score_settings` must give every reading a positive `min_spread`. A second pg_cron job, `trim-cron-log`, deletes job log rows older than 7 days at 3:17am UTC. `baselines.median_28` and `mad_scaled` keep their names; column comments say they hold the window's median and the floored spread. Known limit (D50, kept): a stretch of sleep that starts just before 6pm and runs on without a wake-up counts as a nap. Planned for Phase 4 (D61): saving what each person was shown each morning.
- Watch readings only (D56, D57): `rebuild_nights` works out the user's Watches as the sources with heart rate readings and uses HRV, breathing rate and resting heart rate only from them (or with no source); yesterday's resting heart rate is the median of the Watches' readings for that day. Found by the first reference check on Sabine's year (two watches and the Athlytic app).
- The owner's scripts remember her sign-in in `private/session-live.json` (a renewable session token, readable only by her Mac account), so the password is typed once, in the Mac's Terminal app; the Claude app's terminal panel showed a password typed at a hidden prompt (3 October 2026). `owner_data.py change-password` sets a new password the same way until the app's own screen arrives (Phase 5).

**User answers and logs**
- **`consents`** (Phase 6, D79, D80; migration `20261012000000_consents.sql`): one row per agreement: `user_id`, `version` of the consent text, `agreed_use` and `agreed_us_storage` (both must be true), `agreed_at`, and `ended_at` with `ended_why` (`withdrawn`, or `new_version` when a newer text was agreed). At most one in force per person. Row-level security: people read their own; nobody writes directly. `consent_version()` gives the version everyone must have agreed to (2 since 6 October 2026, after the wording review, D85, migration `20261014000000_consent_v2.sql`; the app's `wording.consent.version`); `has_consent(user)` (server only) says whether an agreement to it is in force; `give_consent(version, use, us_storage)` (signed in) records both statements, unchanged if already agreed; `withdraw_consent(user)` (server only) runs `delete_my_data` and ends the agreement. `delete_my_data` keeps `consents` as well as `profiles`. `ingest_upload` refuses posts from anyone without consent, logged as rejected with `no_consent`.

| Table | Holds | Key fields |
|---|---|---|
| `checkins` | Daily check-in, every change kept (built in Phase 3) | `date`, `answer`, `answered_at`, `status_seen_before`, `is_first` |
| `followthrough` | Nudge answers, every change kept | `date`, `answer`, `answered_at`, `channel` (push, card, next_morning) |
| `notifications` | Outbox and delivery log | `user_id`, `date`, `kind` (morning, reminder, followup), `status` (pending, sent, failed), `payload`, `sent_at`, `tapped_at`, `error`; unique on (`user_id`, `date`, `kind`) |
| `usage_events` | Card views, Why today and trend opens, digest opens, sign-ins (built in Phase 3 with card views, Why today opens and skipped check-ins; later phases add their events) | `event`, `at`, `meta` (never health values) |

**Owner and research**
| Table | Holds | Key fields |
|---|---|---|
| `events` | Illness, major events, travel | `date`, `type`, `note`, `source` (manual, detected) |
| `experiments` | Future register for the causal layer (empty in v1) | `hypothesis`, `outcome_metric`, `baseline_window`, `test_window`, `status`, timestamps |
| `score_settings` | Weights, zone limits, windows, versioned | `version`, `weights`, `ease_off_at`, `rest_at`, `window_nights`, `min_valid_nights`, `per_metric_overrides`, `min_spread`, `illness_spreads`, `illness_min_markers`, `partial_cap`, `frozen`, `active`, `note` |
| `analysis_queue` | Work waiting for the analysis | `user_id`, `from_date`, `to_date`, `reason`, `send_push`, `status` |

---

## 4. Interfaces between parts

### Shortcut to ingest function
- **Call:** `POST /functions/v1/ingest` with the header `Authorization: Bearer <upload token>`.
- **Body:**
  - `schema_version`
  - `kind` (daily, backfill or ping)
  - `month_id` (backfill only)
  - `device_tz_offset_min`
  - `trigger` (charger, app or manual), which automation ran the Shortcut
  - readings in either of two shapes, which become the same rows:
    - `series` (what the Shortcut sends, D42): one object per reading type with lists `start`, `end`, `value`, `unit`, `source` (and optional `device`, `stage`). A type with no readings arrives as `[""]`. If an extra column (unit, source, device) has a different length, it's set aside rather than rejecting the post.
    - `samples`: a list, each with `type`, `start`, `end`, `value`, `unit`, optional `stage`, `source` and `device`
  - Times are ISO 8601 with their offset (`2026-10-03T01:17:06-05:00`); the offset is kept per reading. `device_tz_offset_min` may be minutes or an offset such as `-05:00`. Values may be numbers or text (a decimal comma is accepted). Sleep stages are accepted as Shortcuts and HealthKit name them (Core, Deep, REM, Awake, In Bed, Asleep, or 0 to 5), in `stage` or `value`.
- **Reply:**
  - `accepted` and `duplicates`
  - `night_complete`: true when this post completed last night: the Watch's sleep stages have arrived and the last one (core, deep or REM) ended between midnight and noon local time, at least 10 minutes before the post. A plain "asleep" record, which has no stages, doesn't count (D86, 8 October 2026, migration `20261015000000_night_complete_watch_stages.sql`; the Phase 1b starting rule counted it, while the night builder never did).
  - `already_complete_today`: an earlier post today already completed the night
  - `months_imported` (backfill only, Phase 1c): how many months of the import window (this month and the 11 before it, by the phone's local date) have arrived in full, for the message "Your history: 5 of 12 months imported." A month counts once its last part arrives: the Shortcut marks that post `"month_complete": true` (Phase 1 code review). A month count, not health data
  - `message`: a sentence from the wording module for the Shortcut to show (for example "Last night's readings are in.")
  - on refusal: `error` (`invalid_token`, `token_revoked`, `rate_limited`, `invalid_body` with a `detail` that never repeats a value, or `too_large`) and a `message`; status 401, 429, 400 or 413
- **No health data in the reply.** The token stays write-only.
- **The Shortcut reads replies as text** and looks for `"accepted":`, `"already_complete_today":true` and `"night_complete":true`, so their spelling is fixed by tests. A post counts as stored only if the reply contains `"accepted":` (Phase 1 code review): a gateway error page or timeout has no `"error"` key, so checking for failure would have let a failed import part mark its month done. Device names in the source column have quotes and backslashes turned into apostrophes, since the post is built as text.
- **"Already synced today":** the Shortcut sends a small `ping` first. If `already_complete_today` is true, it stops. After a post with `night_complete` true, it also saves today's date to `iCloud Drive/Shortcuts/Clarivi/last-sync.txt` as a second check, and stops at the start of later runs that day. A partial night never counts as synced. Automations only act between 4am and noon; a run by hand always acts.
- **The one-year import** (Phase 1c, R12): run by hand, the Shortcut asks "Sync this morning" or "Import my last 12 months" (words from the wording module's `shortcut` section, which the Shortcut generator reads). The import sends this month and the 11 before it, newest first (an interrupted import already has the recent months a baseline needs), one `backfill` post per month with whole-month searches ("between the 1st and the 1st of the next month"). Month steps are made in hours (40 days on, 15 days back, then the 1st of that month): Adjust Date ignored steps of whole months on Sabine's iPhone (1c, 3 October 2026). Heart rate is read one day at a time and gathered into the month's post: iOS stopped the Shortcut when one step handled about 3,900 readings, while about 2,000 worked (1c size checks, 3 October 2026). On a heavy day (1,000 readings or more, usually a workout) it takes the day's first 1,000 and last 1,000 by time, keeping the night on either side and dropping only the middle of the day, which the server sets aside anyway (D43; agreed by Sabine, 3 October 2026). The other reading types are small and are read a month at a time. Each month is sent in parts: first the small readings on their own, then heart rate as one backfill post whenever the gathered days reach about 250,000 characters or the month's last day is reached. iOS timed out a 682 KB post before it left the phone while 385 KB went through in 12 seconds (1c send checks). Posts sent before or inside the day-by-day loop worked, but a post made just after the loop ended failed every time, whatever its size, so the last part is sent inside the loop on the month's last day. Only after the last post is the month written to `import-done.txt`. In the import, heart rate goes without its end time and unit (the server sets end to the start and leaves unit empty). After each accepted month it adds the month to `iCloud Drive/Shortcuts/Clarivi/import-done.txt` and shows the reply's message; months already listed are skipped, so an interrupted import carries on (D45). Local load test (`npm run check:local:import`): a month of about 31,700 readings (2.6 MB) is stored in about 1.2 seconds; a heavy one of 46,700 (3.8 MB) in 1.6 seconds, close to the 50,000-reading limit.
- **Size log:** each post writes one line to the function's log (`event: ingest`, kind, month, bytes, readings, result), never readings, to measure posts.
- **What the Shortcut fetches** (Phase 1b spike, 3 October 2026): Health searches in Shortcuts only work in whole days, so it fetches heart rate, HRV, breathing rate, resting heart rate and sleep stages for yesterday and today ("in the last 1 day"), and the server applies the heart-rate window (D43). Building one line per reading took over 14 minutes for a day of heart rate; one list per column takes about a second (D42).

### Web app to database
The app uses the Supabase client with the public (publishable) key and the user's session. Row-level security applies to every call.
- **Reads:** views such as `v_today`, `v_why_today`, `v_trends` and `v_digest_latest`, each built from the results tables.
- **Writes:** database functions only:
  - `submit_checkin(date, answer, status_seen)` (built in Phase 3: the phone's local date, which must be today somewhere on Earth; every answer is kept, with whether it was the first of the day and whether the status had been seen, from the app or from a logged card view showing a status; at most 50 a day)
  - `submit_followthrough(date, answer)` (accepted only from 8pm on change days, and until the next morning)
  - `register_push(subscription)`
  - `log_usage(event, meta)` (built in Phase 3: events `card_view`, `why_today_open`, `checkin_skipped`; the meta may hold only `date`, `status_shown` and `state`, the kind of card, never a status or a reading; past 500 events in a day it stops logging quietly)
- **Zone numbers (D62, built in Phase 3):** `status_zones(version)` returns a settings version's Ease off and Rest limits, its normal window and minimum valid nights (overall and per reading) and the readings in order of weight, never the weights; with no version it gives the active one. Signed-in users only.

- **Built in Phase 4, the app's part (4 October 2026, local copy):** the card also reads today's and yesterday's `shown_status` (the first nudge shown each day decides a change day, D61), their `followthrough` answers and the latest notification of the last two days. From 8pm on a change day the question sits at the top (`askTonight`), and the next morning until noon an unanswered day is asked first (`askYesterday`, D67, D68); both are in `src/lib/follow.ts` with tests. A card showing a status calls `record_shown`. Opening the app with `?n=<id>&k=<kind>` calls `log_notification_tap` and, for the 8pm notification (`k=followup`), counts an answer as given there (channel `push`); otherwise `card`, or `next_morning` for yesterday's. The change day is the first nudge shown that day (D61): the card's current status decides only when nothing has been shown yet, and the card records it before saving an answer. Phase 4 code review (4 October 2026): the 8pm notification isn't sent for a day already answered; a send left unfinished for 5 minutes is marked failed, never sent twice; a failed status lookup counts as a failed send.
- **Built in Phase 3, how the app reads (4 October 2026):** straight from the tables under row-level security rather than views, since each screen needs only a few small queries. The card (`src/lib/today.ts`) reads today's `daily_status`, the last three days of `uploads` and the newest accepted sync, import months, today's `baselines` and `nights`, today's check-in and whether it was skipped; `src/lib/card-state.ts` then picks the card from the phone's clock: the sync that completed the night sets the time shown, 11:30 marks it late, and a first sync after noon gives no status (R25 to R32). Why today (`src/lib/why.ts`) adds 28 nights, today's normals, today's `insights` and `status_zones` for the day's settings version. Screens: `#/` (the card), `#/why` and `#/settings`, in the address so a notification's link can reach them later. While a sync is awaited the card checks again each minute, and on every return to the app.

### Web app to server functions
Each call carries the user's session.
- **`account-token`:** checks the password, then creates or reissues the upload token. The token is returned once.
- **`account-withdraw-consent`** (Phase 6, D80): checks the password, then calls `withdraw_consent(user)`: everything is deleted as Delete my data does, the agreement ends and its record stays; the app then asks for consent again. `account-token` refuses (`no_consent`, 403) until the person has agreed, and `ingest` answers `no_consent` (403) with a message telling the person to open Clarivi and agree.
- **`account-delete-data`:** checks the password, then deletes the user's readings, results, answers, tokens and subscriptions. The account itself stays. Built in Phase 5 (local copy, 4 October 2026): it calls `delete_my_data(user)` (service role only), which finds every public table with a `user_id` column except `profiles` and deletes that person's rows, so a table added later is covered without changing it; it also clears the profile's time zone.
- **`account-change-password`** (built in Phase 5, R4): checks the current password, refuses a new one under 12 or over 72 characters or the same as the current one, then saves it. Saving a password ends every session, so the app signs straight back in. The password re-check is now one shared helper (`passwordMatches` in `_shared/http.ts`), used by `account-token` too.
- **`account-first-login`:** takes the new password, refuses one under 12 characters or the temporary password itself, then saves it and clears the change-password flag in one step. Saving a password ends every session, so the app signs straight back in with the new one.
- **`send-push`:** in Phase 1a, sends a test notification to the signed-in user's own devices after an optional delay (up to 30 seconds), replying at once and sending in the background. Phase 4 (built on the local copy, 4 October 2026) adds `{"kind": "due"}`, accepted only with the cron key in the `x-clarivi-cron` header, which the sender checks by asking the database (`cron_key_ok`, service role only; D66): it claims due outbox rows (`claim_due_notifications`, so no row is sent twice and anything past its time expires), writes each message from the wording module (`send-push/outbox.ts`: the morning status and reason, or the reminder or 8pm question with no health detail; a tap opens `/?n=<id>&k=<kind>`), sends it to each of the person's phones, retires phones the push service says are gone, records the morning's shown status (D61) and marks the row sent, skipped (no status any more, or no phone) or failed.
- **`owner-status`:** owner only. Returns per-user sync, reminder, delivery and import status, with no health values. Built in Phase 5 as a database function, `owner_status()`, which works out the caller from the session and refuses anyone but the owner (like `replace_my_events`), so it needs no server function: each person's last accepted daily sync, the days in the last 14 that needed the 11:30 reminder and whether two came in a row (in the last 7 days), failed notifications in the last 2 days, months imported (as the card counts them), and the database's size in MB.
- **`owner-reset-password`** (built in Phase 5, R63, D74): owner only (checked from the profile); takes a tester's email and a temporary password (12 to 72 characters), refuses the owner's own account, sets the password and the change-password flag. Called by `owner_data.py reset-password`, signed in as the owner; never logs the email or password.

### Schedulers
- **Every minute:** `run_analysis_queue()` processes queued work (built in Phase 2: it merges each user's pending work, waits while an import is still arriving, and retries failed work up to 3 times), then writes morning notifications to the outbox (Phase 4).
- **Daily, 3:17am UTC:** `trim-cron-log` deletes job log rows older than 7 days (Phase 2 code review).
- **Every minute:** calls `send-push`, which sends pending outbox rows. Built in Phase 4: `send_due_notifications()` calls it through pg_net only when something is due, reading the cron key and the functions' address from Vault. The cron key (`clarivi_cron_key`) is made inside the database by the Phase 4 migration and kept only in Vault, so nobody sees it (D66, refined 4 October 2026); the address (`clarivi_functions_url`, not a secret) is set once per project, as it differs between the local copy and the live project.
- **Every 5 minutes:** `plan_notifications()` adds 11:30 reminders and 8pm follow-ups for users whose local time has reached them.
- **Weekly (Monday, 5am local, Default):** `build_digests()`. Built in Phase 5: `build_due_digests()` runs every hour (cron `build-digests`) and, from 5am on Monday in each person's local time, builds last week's digest (Monday to Sunday) for anyone with an accepted sync that week. `build_digest(user, monday)` works out the facts: nights with data, statuses as shown each morning (D71), the Ease off and Rest days, each score reading's nights below or above the range and its average against normal, nights the illness pattern showed, and change days with followed, not followed and unanswered (latest answer). `_shared/digest.ts` writes the sentences from `wording.digest`. No notification (D72).

### Owner administration
- Create accounts in the Supabase dashboard with a temporary password, marked as confirmed so no email is sent.
- A short admin script resets a password and sets the change-password flag again: built in Phase 5 as `.venv/bin/python scripts/reference/owner_data.py reset-password`, run in the Mac's Terminal app, which calls the owner-only `owner-reset-password` function, so the secret key stays in the functions' secret store (D74).
- Events for the owner's year are loaded from a small file with a script.

### Wording
- One shared wording module, `supabase/functions/_shared/wording.ts`, holds every sentence the app and notifications use: briefings, verdicts, nudges, notification text and state messages. It is plain TypeScript, so the web app and the server functions import the same file.
- Built in Phase 3: `supabase/functions/_shared/briefing.ts` puts the words together from a `daily_status` row (the card's headline and briefing, the morning notification's reason, Why today's summary and "Also checked", and last night's values while learning). The briefing says what was off (outside the range, or at least one spread worse inside it: "a little"), what it means, then what was normal, better, missing or still being learned, with the illness check's words only when it ran. `npm run wording:sheet` prints a sample sheet of every state's words on made-up days, for review.
- The app and the push sender both use it, so the words are defined in one place and tested once.

---

## 5. System patterns (secure and extensible)

1. **Isolation in one place.** Every table has row-level security tied to the signed-in user. A test in the automated checks fails the build if any table has row-level security switched off (shown to work on 2 October 2026 with a deliberately unlocked table). Views run with the reading user's permissions. Direct writes are revoked: rows change only through triggers and named database functions.
2. **Elevated access only in named functions.** The secret key exists only inside server functions. Each one works out the user from a verified token or session, and never from the request body. This covers the upload path, which bypasses row-level security. The gateway's own token check is switched off for these functions; each checks the session with Supabase Auth itself, which works with the project's publishable and secret keys.
3. **Raw first, results rebuildable.** Raw readings are never edited. Every result can be rebuilt for any user and date range with one function, so a rule change is a recompute, never a re-sync.
4. **Queue, don't block.** Uploads only store and queue. Analysis runs separately, so a heavy import never times out the Shortcut.
5. **Outbox for notifications.** Analysis and schedules write notification rows, and a single sender delivers them. A unique key on (user, date, kind) guarantees at most one notification of each kind per day.
6. **Idempotent everything.** Readings carry a unique hash per user, a repeated post is ignored, and recomputing gives the same result.
7. **One module contract.** Every analysis module writes to `insights` in one shape. The card, digest and nudge read only `daily_status` and `insights`, so new modules plug in without screen changes.
8. **Versioned, frozen settings.** Score settings are versioned rows, and every daily status records the version it used. Settings are frozen for the test period.
9. **Swappable edges.** Each of these can be replaced without touching the rest:
   - The sync source (the Shortcut now; a HealthKit app later posts the same format).
   - The delivery channel (web push now; email later).
   - The digest writer (template now; model-written later).
10. **Clear time rules.**
    - A night belongs to the local date of waking.
    - Local times come from the stored offsets.
    - Schedules use each user's latest offset.
11. **Words in one module.** The wording module has tests:
    - no condition names
    - no numbers in briefings
    - at most three sentences
    - no health detail in reminder and follow-up text
    - no em dashes
12. **Nothing secret in the build.** Every build ends with `scripts/check-build-secrets.mjs`, on GitHub and on Vercel. It fails if a Supabase secret key, a token with an elevated role, or the exact value of any secret setting in the build environment appears in the files sent to browsers. CI also plants a fake secret to prove the check catches it.

---

## 6. Security

**Authentication**
- Supabase Auth with email and password. New sign-ups are switched off.
- Minimum password length is 12, set on the live project on 3 October 2026; the app and `account-first-login` refuse shorter passwords too. Supabase's leaked-password check is switched on if the plan includes it.
- New sign-ups are blocked by the general "Allow new users to sign up" switch. The Email provider must stay on: switching off its own sign-up setting also switches off email sign-in (found in Phase 1a).
- Sessions:
  - Long-lived, with refresh token rotation.
  - A 30-day inactivity timeout (R6), switched on 9 October 2026 with the move to Supabase Pro (D90; it needs Pro): a session not refreshed for 30 days ends at its next refresh. Opening the app refreshes it, and the Shortcut's upload token and notifications don't depend on a session.
  - "Sign out everywhere" ends every session for the user. Built in Phase 5 (and fixed before its manual check 3): it first calls `forget_all_devices()`, which stops notifications to every one of the user's devices, so a lost or shared phone never shows their status on its lock screen; then it ends every session. The server refuses an ended session at once, and the app checks its sign-in (`getUser`) when it opens and when it comes back to the front, going straight to the sign-in screen (and dropping that device's notifications) when it has ended; no connection is not taken as a sign-out. A device that signs in again registers afresh.
- First sign-in: the change-password flag sends the user straight to "Set a new password". The flag is cleared only by `account-first-login`, in the same step that saves the new password.
- Password re-checks before sensitive actions are done by the server function signing in with the password. Supabase's built-in re-authentication sends an email code, and there is no email in this app. Known limit (Phase 5 code review, accepted for v1): every check signs in from the functions' servers, so all users' checks share Supabase's sign-in rate limit for one address; many wrong tries by one person could briefly make others' checks fail. With four people this is unlikely; if it happens, wait a few minutes.

**Authorization**
- Row-level security on every table: a user reads and writes only rows with their own `user_id`.
- The owner flag lives in admin-only metadata, set from the dashboard.
- `owner-status` checks the flag and returns only operational information (sync times, counts, delivery status), never another user's readings.

**Upload tokens**
- Each token is 32 random bytes, written as `clv_` plus 43 URL-safe characters, shown once and stored only as a SHA-256 hash.
- Tokens can write but never read, and can be revoked.
- `last_used_at` is tracked.
- The Shortcut is shared as a blank template that asks for the token when it's installed. A configured Shortcut is never shared.

**Secrets**
- The secret key and the push signing key (VAPID private key) are kept only in Supabase's secret store, with one exception: Vercel's Supabase integration (D21) copies the secret key, the database password and connection addresses, and the token-signing secret into Vercel's encrypted settings. The app never reads them (decided 2 October 2026). Changed by D81 and done on 5 October 2026: Vercel's Supabase integration is removed, so Vercel holds only the three public values, typed in by hand (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`, for Production and Preview). The secret key was replaced (the functions use the one named `functions`, through `pickKey` in `_shared/http.ts`), the database password reset, the legacy `anon` and `service_role` keys disabled, and the legacy HS256 signing secret revoked; sign-in passes are signed with an ECC P-256 key (published at `/auth/v1/.well-known/jwks.json`). So the full-access values live only in Supabase.
- The web app holds only the public key and the push public key. The build reads exactly three values by name (the project address, the publishable key and the push public key), so nothing else can reach the browser.
- The live push signing keys were created on 3 October 2026 and sent straight to Supabase's secret store; the private key isn't stored anywhere else. Local development uses separate local-only test keys in `supabase/functions/.env`, which is never committed.
- The repository holds no secrets. CI needs none so far; if it ever does, it uses GitHub's encrypted secrets.

**Input validation**
- Every ingest body is checked against the shared schema.
- Rejected: unknown types, unknown schema versions, timestamps in the future or outside the expected window, and values outside sensible ranges (Default: heart rate 25 to 250 bpm, HRV 1 to 300 ms, breathing rate 4 to 60 per minute). A reading longer than a day is rejected, except resting heart rate, which may span up to a week (seen in the 1c import).
- A reading that fails a check is set aside and the rest of the post is stored; the upload row records how many were set aside (`set_aside_count`) and the first few reasons (`set_aside_note`), never the values. A post that is malformed as a whole (not JSON, an unknown schema version or kind, a bad month) is refused (agreed by Sabine, 3 October 2026, after one resting heart rate reading blocked a month of the import).
- Limits: 5 MB per request and 50,000 readings per request (Default). One month of history is expected to be a few hundred kilobytes.
- Database functions check their own inputs (for example, a follow-through answer only on change days, from 8pm).

**Rate limits**
- Ingest, per token, each counted separately: 60 an hour for daily posts and rejected posts, 200 an hour for import (backfill) posts, and 200 an hour for pings (agreed by Sabine, 3 October 2026; D47 for pings). A one-year import sends each month in parts, about 60 posts in about half an hour.
- Sign-in: Supabase's built-in limits.
- Notifications: at most three a day per user (morning, reminder, follow-up), enforced by the unique key.

**Cost limits**
- Supabase's spend cap stays on once the project is on Pro.
- No paid third-party services.
- Expected cost: Supabase Pro, about $25 a month since 9 October 2026 (D90), with the spend cap on so nothing more is charged; Vercel Hobby and the local copy of Supabase cost nothing. Until then the build cost nothing (Supabase free plan).
- An owner alert fires when the database passes 400 MB (Default; the free limit is 500 MB).

**Privacy**
- HTTPS everywhere. Encryption at rest on every Supabase plan.
- Since 9 October 2026 (Pro, D90) Supabase backs up the database every day and keeps the last 7, restorable from the dashboard (Database, Backups). Our own backup stays as well, as the copy kept outside Supabase and the one whose restore is practised. Until then the free plan had no automatic backups (checked against Supabase's documentation, 30 September 2026). A backup copy of the database is made with the Supabase CLI's `db dump` command, as Supabase recommends for free projects, and saved to an encrypted folder on your laptop at least weekly and before every database change (Default), and one restore is practised before the test. Backups are never stored in GitHub or CI.
- **Backups as built (Phase 6, 4 October 2026, D77):** an AES-256 encrypted sparse disk image, `~/ClariviBackups.sparsebundle` (outside Documents and iCloud, which would copy testers' data to another service), opened with `hdiutil attach ~/ClariviBackups.sparsebundle` only while backing up or restoring, then `hdiutil detach /Volumes/ClariviBackups`. `scripts/backup-live.sh` (no database password: the Supabase tool signs in with a temporary role) writes a dated folder with `roles.sql`, `schema.sql`, `data.sql` (every row, sign-in accounts with their password hashes included, hence the encryption) and `counts.txt` (rows per table only), and refuses to write anywhere but the open image. `scripts/restore-local.sh <folder>` practises a restore on the local copy: wipe and apply the migrations, load `data.sql` with triggers off, then match every table's row count. A backup holds no scheduled jobs and no Vault keys: a real restore into a new project applies the migrations first (they schedule the jobs and make a new cron key), then the data, then sets the functions' address in Vault, sets the function secrets again (`supabase secrets set`; the VAPID private key lives only in the old project's secret store, so a lost project means new VAPID keys, a new public key in Vercel, and each phone registering again when the app next opens) and deploys the functions. After a practice restore, `npx supabase db reset` wipes the local copy so no real data stays there.
- No third-party scripts. A strict Content Security Policy on the web app blocks outside scripts. Built in Phase 6 (4 October 2026) in `vercel.json`, for every page and file: `default-src 'none'`; scripts, styles, images, fonts, the manifest and the service worker only from the app itself; connections only to the app and the live project (`https://vuynnnrijdbvamwfauog.supabase.co`); no framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), no plugins, no changed base address; plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, a Permissions-Policy turning off camera, microphone, location, payment and USB, and `Cross-Origin-Opener-Policy: same-origin`. Vercel previews sit behind Vercel's sign-in, so the live headers are checked on production. `csp-config.ts` reads the policy for the tests.
- Usage logs hold no health values.
- Retention: testers' data is deleted 90 days after the test ends unless they agree otherwise (Default).

---

## 7. Hosting, deployment and configuration

**Environments (decided 30 September 2026: one Supabase project)**
| Environment | Supabase | Web app | Used for |
|---|---|---|---|
| Local | A local copy on your laptop and in CI, with made-up test data. Unlike the live project, it doesn't switch row-level security on automatically for new tables, so the CI check still catches a table without it | Runs on your laptop | Building and testing every database change before it goes live |
| Live | The one Supabase project; free while building, Pro since 9 October 2026, before the test (D90) | Vercel production address and preview addresses | Spikes, real data for the four users, and checking changes on your phone |

- Region: US East (`us-east-1`), the closest to the Cayman Islands.
- **Live project (created 2 October 2026):** Supabase project "Clarivi", ref `vuynnnrijdbvamwfauog`, address `https://vuynnnrijdbvamwfauog.supabase.co`, Pro plan since 9 October 2026 (D90; free until then), US East. It replaced a project created in US West by mistake (ref `pupxkjhhhgeeoqyvtsst`), which is no longer used.
- **Repository:** `github.com/sabinejoseph8/Apple-Health`, public. It must never hold secrets or backups.
- **Vercel and Supabase:** first connected through Vercel's official Supabase integration (D21); since 5 October 2026 (D81) not connected at all: the web app's three public values are set by hand in Vercel for Production and Preview.
- **Production address:** https://clarivi-zeta.vercel.app (Vercel project `clarivi`). It is also the push contact address (`VAPID_SUBJECT`).
- Vercel previews talk to the same live project, so preview checks are done signed in as the owner or a test account, never as a tester.
- A dedicated test account (created 3 October 2026; its email is kept out of this public repository) holds made-up data for checking previews.
- The live project was created with Supabase's automatic row-level security for new tables (an event trigger, `rls_auto_enable`). Outside calls to that function are revoked (migration of 3 October 2026).

**Deployment**
1. A change goes on a branch. GitHub Actions runs three checks on every push: the app (type check, unit tests, build with the secret check), the database (row-level security and cross-user tests against a local copy of Supabase) and end to end (Playwright in WebKit at iPhone size).
2. Vercel builds a preview, pointed at the live project. You check it on your iPhone, signed in as the owner or the test account.
3. Database changes are applied to the live project only at release, and only in a backward-compatible way: add new columns or tables first, remove old ones in a later release, so the live app and a preview never break each other.
4. Before any database change during the test, take a manual backup to your encrypted laptop folder (Supabase's daily backups, since 9 October 2026, are a second layer, D90).
5. Server functions are deployed at the same time as their matching database change, and whenever a shared file they use changes (`supabase/functions/_shared/`, the wording module above all): each function carries its own copy of those files, so new words reach the notifications and the Shortcut's messages only when the functions are deployed again (found 6 October 2026, when the morning notification kept the old words for half a day after the wording release).
6. Merging to `main` publishes the web app to production.
7. Releases are tagged and listed in a changelog. During the test, score logic and settings are frozen.
8. **If personal data is ever exposed** (from the data protection check, 4 October 2026): within 5 days, tell the people affected and the Cayman Ombudsman; also the Commission d'accès à l'information for a Quebec tester (when there's a risk of serious injury), the Privacy Commissioner of Canada for an Ontario tester (if PIPEDA applies and there's a real risk of significant harm), and a DC tester as fast as possible. Say what happened, what it means, what was done, and what the person can do. Keep a register of every incident, even small ones.

How a release reaches the live project: sign the Supabase command-line tool in once on the laptop (`npx supabase login`, approved in the browser with a verification code), link the folder to the project, then `supabase db push` for migrations (no database password needed), `supabase functions deploy` for functions and `supabase secrets set` for function settings.

**Configuration**
- **Web app:**
  - three values, set by hand in Vercel for Production and Preview, and nothing else (D81, 5 October 2026; Vercel's Supabase integration is removed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (the new-style `sb_publishable_` key) and `VITE_VAPID_PUBLIC_KEY`. The build can also read the integration's old names (`env-config.ts`), but none are set. If the publishable key is ever replaced, update it here and redeploy.
  - on your laptop, `.env.local` (never committed) points the app at the local copy of Supabase; CI builds without these values
- **Server functions:**
  - the secret key (provided by Supabase)
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT` (the app's web address)
- **Database:**
  - score settings in `score_settings`
  - schedules defined in migrations
- **Shortcut:**
  - one versioned template per release, generated by `scripts/shortcut/build_shortcut.py` and signed with Apple's `shortcuts sign` on Sabine's Mac. The signature carries the signer's Apple account email, so signed files live only in `private/shortcut/` (never committed); only the generator is in the repository. `scripts/shortcut/build_check_shortcut.py` builds "Clarivi Check", a diagnostic that shows what the phone finds in Health without sending anything.
  - the upload address and the token entered at install

---

## 8. Testing approach

- **Database tests (pgTAP):**
  - Cross-user tests on every table, for reading and writing.
  - The upload path: one user's token can't write another user's rows, and a token can never read.
  - The missing-reading and learning-your-normal rules, the one-notification-per-day key, and night dates across a time-zone change.
  - A test must not name a calendar day that can become the real "today": the status rules treat today differently (a morning sync with no night is sleep in progress today, not enough data on a past day). Use a day safely in the past, or work from `now()` as `21_night_complete` and `22_no_sleep_stages` do (found 10 October 2026, when `07_daily_status` broke at midnight).
- **Server function tests (Deno):** ingest validation, duplicates, the reply flags, rate limits, password re-checks and delete-my-data. Run with `npm run test:functions` (Deno comes from npm, so nothing extra to install). Built in 1b: the post schema (both shapes, the heart-rate window, time zones, ranges), the ingest handler (token hashing, size limit, replies and the exact text the Shortcut looks for) and token generation.
- **Shortcut checks (Python):** `python3 scripts/shortcut/test_build_shortcut.py` checks the generated Shortcut is well formed (every variable wired to an earlier action, blocks closed, valid JSON, token asked for at install, no loops, whole-day searches). Runs on every push.
- **Reference check (pandas):** the owner's year is recalculated outside the database, stage by stage (nights, sleeping heart rate, baselines, status). It must match the SQL before any tester sees a status, and is rerun after any change to the SQL. Built in Phase 2c (`scripts/reference/`, in a project-only Python environment, `.venv`, with pandas):
  - `reference.py` re-implements the rules from the decisions (D10, D11, D35, D36, D48 to D53), not from the SQL, and keeps its own copy of each score settings version.
  - `check.py --live` signs in as the owner, reads her readings and results through the web interface (row-level security limits it to her rows), and compares nights, normals and statuses value by value; `check.py --local-synthetic` does the same on the local copy with a seeded made-up history (long awake spells, overlapping records, naps, a trip 8 hours ahead, missing readings, an unfinished night), on every push.
  - `today.py` prints a day's status in plain words for the owner's self-test (end of Phase 2).
  - `measure.py --live` reports the Signal on her year for the current settings and a few alternatives, tried in pandas only. Disrupted mornings follow D55 and D60 (workouts judged by day, Watch workouts only).
  - Unit tests (`python -m unittest discover -s scripts/reference`) hold the reference to the same agreed examples as the database tests, on every push. Nothing these scripts read is saved.
- **Front-end tests (Vitest):** state selection (which card state shows when) and the wording module rules. Built in Phase 3: `src/lib/card-state.test.ts` (every card situation from the clock and the day's data: waiting, readings in, sleep in progress, no sync yet, late, after noon, not enough data, learning, rejected sync, import months), `src/briefing.test.ts` (the design's sample day word for word, and the wording rules over 1,944 made-up days covering every mix of readings, statuses and illness-check results), `src/lib/why.test.ts` (the numbers panel's words).
- **End-to-end tests (Playwright, iPhone screen size):** set up on 3 October 2026 (`npm run test:e2e`, tests in `e2e/`). They run in WebKit, Safari's engine, on an iPhone 14-sized screen (390 points wide), locally and on GitHub with every push. Since Phase 5 (4 October 2026) GitHub runs them on a Mac, so text is drawn in Apple's system font as on the iPhone: on Linux the stand-in font is taller, and the one-screen check failed there by 12 to 15 points while the card fits on the Mac (7 points to spare on the longest card) and on Sabine's iPhone. The first tests cover the sign-in screen: its form and contact line, no sideways scrolling, 44-point tap targets, and the manifest, icon and service worker. Still to come:
  - every card state, Why today and the numbers toggles (built in Phase 3: `e2e/card.spec.ts` and `e2e/why-today.spec.ts`)
  - follow-through timing, with the clock set to before and after 8pm
  - the check that the morning card fits in 390 by 763 points (built in Phase 3)
  - Phase 3's screen tests sign in a made-up tester and answer every database request with made-up rows (`e2e/fixtures/mock-app.ts`), with the clock fixed at the design's sample morning in a UTC-5 time zone. The service worker is blocked in these tests: once it controls the page, requests skip Playwright's interception and reach the real server (found in Phase 3, when it made the tests flaky). `SCREENS=1 npx playwright test e2e/screens.spec.ts` saves a screenshot of every state to `screenshots/` (never committed) for review.
- **Manual checks on real iPhones:**
  - install, sign in and Keychain autofill
  - notification taps
  - both Shortcut triggers, with the phone locked and unlocked
  - import timing, and an interrupted import resuming
- **Local account check** (`npm run check:local:account`, Phase 5, on every push in the "Local end to end" job): with the local copy and functions running, a made-up account changes its password (wrong current, too short and the same password refused; the old password stops working), gets a token, a check-in, a log line and a phone, deletes its data (a wrong password deletes nothing; with the password nothing is left; the account still signs in), and signs out everywhere (a second session ends too).
- **Local notification check** (`npm run check:local:notify`, Phase 4): with the local copy and the functions running with the local settings (`supabase/functions/.env`, never committed, holds local test push keys), it checks the database made its own cron key and sets the local functions' address in the local Vault, gives a made-up person a fake phone and an Ease off morning, and checks that the database's every-minute call reaches the sender, the phone decrypts "Ease off today: HRV well below your usual, sleep short", the outbox and the shown status are recorded, a wrong key is refused, and a tap is logged. Local only, like the Phase 1a check, as GitHub's checks have no push keys.
- **Local end-to-end check** (`npm run check:local`, Phase 1a): with the local copy and functions running, it signs in made-up accounts, runs the password change, sends a test push to a fake device that decrypts it, and checks a second account sees nothing of the first.
- **Local sync check** (`npm run check:local:sync`, Phase 1b): with the local copy and functions running, it creates a token with a password check, posts the way the Shortcut does (ping, daily post in rows and in columns, a repeat, readings set aside), reissues the token, and checks a second account sees nothing. Since the Phase 1 code review it runs on every push, with the import load check (`npm run check:local:import`), in the "Local end to end" GitHub job, which starts the local copy and the functions.
- **Build secret check:** see pattern 12.
- **Security headers** (Phase 6): `csp.test.ts` checks the policy itself (only the app's own code, no inline code or eval, connections only to the app and the live project). `e2e/csp.spec.ts` serves a production build with the same headers through `vite preview` (port 5175, the made-up database's address swapped in for the live project's) and fails on anything the policy blocks or any request to another site, on sign-in, the card, Why today, trends, Settings and the digest.
- **Privacy check from the outside** (Phase 6, `scripts/reference/privacy_check.py`): as real people, through the same doors the app uses. Signed out, no table gives a row and no database function runs; as the test account, its own profile is readable and no one else's rows in any table, no table takes a direct write, and the owner's and server's functions refuse it (called only with made-up ids or invalid input, so a failure couldn't touch anyone's data; server functions that take no person are left to the catalog check); upload tokens: none or made-up refused, a new one works, a replaced one is refused at once, and a token reads nothing. It never prints a row and refuses to run as the owner. `--local` runs it with two made-up accounts (one with rows to hide) and deletes them; `--prove` adds an unprotected table for the run, which must fail; both run on every push in the "Local end to end" job. On the live project Sabine runs it in the Mac's Terminal as the test account (4 October 2026: 110 of 110 passed). `scripts/live-privacy-catalog.sql` reads the same rules from the database catalog, read-only (4 October 2026: all 19 tables with row-level security; anonymous visitors can read, write and run nothing; signed-in people write no table directly and may run only the 11 functions meant for them; every function running with its owner's rights has a fixed search path; no storage buckets).
- **Code review at the end of each phase:** everything the phase changed is reviewed for bugs and security problems, findings are fixed, and the phase's automated tests are re-run before the phase is called done (added 3 October 2026).
- **Every push runs all automated tests.** A failure blocks the release.

---

## 9. Critical risks and challenges

The riskiest items sit in the earliest phases. Phase names are proposals for progress.md: 1 Spikes, 2 Data and analysis, 3 Card and Why today, 4 Notifications and follow-through, 5 Trends, digest, settings and owner page, 6 Hardening and dry run, 7 Two-week test (four weeks until D89).

| Risk | Why it matters | How to handle | Phase |
|---|---|---|---|
| Shortcut can't read Health data while the phone is locked | The unplug trigger would rarely work and syncs would arrive late | Measure how often the catch-up trigger does the work; keep both triggers; move to a HealthKit app only if both fail often | 1 |
| Shortcut may not return Watch sleep stages | The sleep window and the "night finished" check depend on them | Check first in the sync spike; if only "asleep" arrives, keep the window rule; if stages are missing, change the night rule before building analysis | 1 |
| A year's import through Shortcuts is too slow or fails | No baselines on day one | Import in monthly parts that resume; time it on two phones; narrow the heart rate window first if needed | 1 |
| Past readings may lose the time zone they were recorded in | Travel days in the owner's year can't be detected from offsets, and nights could be misdated | Test with a known trip; if lost, take trips from the calendar or detect them from shifts in sleep timing. Phase 1b (3 October 2026): confirmed lost (Shortcuts stamps every reading with the phone's current zone), so Phase 2 takes trips from the calendar or the user. Phase 1 code review: the 6pm-to-noon heart rate window then sees imported trip nights at the wrong clock time and drops part of them; accepted for v1 (D46) | 1 |
| Web push on the iPhone fails silently, or a tap opens a signed-out app | No morning nudge means no Value evidence | Push spike on real phones; log delivery; re-register each time the app opens; show notification health on the card. 1a spike: a test push reached Sabine's iPhone and a tap opened the app signed in; the app re-registers on every open | 1 |
| The Deno push library doesn't work in Edge Functions | No notifications | Try it in the push spike; fall back to `npm:web-push`. Resolved in 1a: it works, no fallback needed | 1 |
| Upload path bypasses row-level security | One tester's data could land in another's account | Work out the user from the token hash only; cross-user upload tests in CI | 1 |
| A table ships without row-level security | Data exposed to other users | A CI check fails the build when any table lacks row-level security (proven in 1a); the live project also switches it on for new tables automatically | 1 |
| SQL statistics subtly wrong | Confident wrong nudges | Stage-by-stage pandas check on the owner's year before testers start. Phase 2c (3 October 2026): the reference (`scripts/reference/`) matches the database on every night, normal and status of the owner's year, and on a made-up history on every push; its first run found two watches and an app in her readings (D56, D57) | 2 |
| HRV readings too sparse at night | The heaviest-weighted reading is often missing, or its baseline never finishes building | Count nights with HRV at the import; adjust the weights, the minimum (14 nights) or the window (42 nights) before freezing the settings. Phase 1c (3 October 2026): 239 of Sabine's 240 tracked nights (99.6%) have HRV during sleep, median 3 readings a night | 2 |
| Score settings unproven | Too many or too few Ease off days | Set from the owner's year against disrupted days and the "1 day in 7" limit; then freeze. Phase 2c (3 October 2026): version 2 frozen (D59), about 1 day in 7.5 on her year; the disrupted-day target was not met on thin evidence, so the testers' check-ins carry the Signal; a short night can still be Ready, watched in the self-test | 2 |
| Heavy recompute times out | Imports stall | Queue work, process one month at a time, never inside the upload request. Phase 2a (3 October 2026): work is queued and merged, and a made-up year (275,000 heart rate readings) recomputes in about 0.2 seconds on the local copy | 2 |
| Previews and changes touching real testers' data (one project) | A bad preview or database change could damage the test data | Build and test every database change on a local copy first; apply changes only at release and backward-compatibly; check previews as the owner or a test account; back up before every change during the test | 1 |
| Free plan during the test: no automatic backups, and the project can pause (resolved 9 October 2026: on Pro before the test, D90, with daily backups and no pausing) | Lost testers' data would end the test; a paused project stops syncs | Daily syncs keep the project active; manual backups at least weekly and before every change; practise one restore in phase 6; check the project is active each morning on the owner page; move to Pro after the test | 6 |
| The inactivity timeout needs Pro (resolved 9 October 2026: on, with Pro, D90) | Sessions don't expire through inactivity during the test | Accepted for the test; "Sign out everywhere" is available; switch the timeout on after the move to Pro | 6 |
| Lock-screen text shows health detail | Privacy concern for testers | Status and reason only in the morning; nothing in reminders and follow-ups; consent and the "When Unlocked" guide | 4 |
| Wording drifts into medical claims | Health-adjacent responsibility | One wording module with forbidden-term tests | 3 |
| iOS or Shortcuts updates change behaviour mid-test | Syncs break for everyone at once | Freeze phone updates where testers agree; owner page flags missed syncs the same day | 7 |
| Health data stored outside the Cayman Islands | Data-protection rules may apply to sensitive data and transfers abroad | Checked 4 October 2026 for Cayman, Ontario, Quebec and DC (`docs/cayman-data-protection.md`; not legal advice): build to Quebec's rules; separate consent to the US storage (D79); the privacy impact assessment (`docs/privacy-impact-assessment.md`); a breach plan reaching every regulator within 5 days | 6 |

---

## 10. Decisions and open questions

### Decisions (29 September 2026 unless noted)
| Topic | Decision |
|---|---|
| Builder | Claude Code, in a repository Sabine owns |
| Front-end host | Vercel, deployed from the repository |
| Backend | Supabase for database, login, functions and schedules |
| Analysis | SQL, with Edge Functions for anything awkward; pandas only as the reference check |
| Sync | iPhone Shortcut posting raw readings as JSON with a per-user, write-only upload token |
| Sign-in | Email and password; no sign-up, no email; owner creates accounts |
| Notifications | Web push to the home-screen app; no third-party service |
| Environments (30 Sep 2026) | One Supabase project for everything; a local copy of Supabase for building and testing database changes |
| Supabase plan (30 Sep 2026) | Free while building and through the test; Pro after the test |
| Region (2 Oct 2026) | US East; the project was recreated there while still empty |
| Vercel and Supabase (2 Oct 2026) | Connected through Vercel's official Supabase integration; the secret values it copies into Vercel are never read by the app |
| Push library (3 Oct 2026) | `@negrel/webpush` 0.5.0, proven with Apple's push service in the Phase 1a spike |
| Analysis in the database (3 Oct 2026) | Nights, normals, status and insights are rebuilt by `recompute()` from raw readings, queued by uploads and run every minute by pg_cron; checked against an independent pandas reference |
| Watch readings (3 Oct 2026) | A Watch is any source that records heart rate (D56); sleep has no source, so overlapping sleep records count once with awake winning (D49) |
| When last night is complete (8 Oct 2026) | Only the Watch's sleep stages complete it for the sync, the same rule the night builder uses (D86) |
| Past days (8 Oct 2026) | `#/day/<date>` opens Why today for that date from the same tables (`src/lib/day.ts`, `DayView`); a date that doesn't exist opens the card; stepping between days replaces the address, so Back returns to where the days were opened (D88). Its words come from `wording.pastDay`; `whySummary(day, past)` and `alsoChecked(..., past)` swap in the past-day sentences, so today's screens and the morning notification keep theirs |
| Supabase Pro (9 Oct 2026) | The project moved to Pro before the test (D90): daily backups kept 7 days, no pausing, the 30-day inactivity timeout on (R6), 8 GB of disk included (the owner page warns from 80%, about 6.4 GB), the spend cap on; our own encrypted backups continue |
| In-app links (8 Oct 2026) | A link to another screen is `AppLink` (`src/components/AppLink.tsx`): the real address in `href`, and a tap goes through `go()` or `goDay()`, so Back knows the screen was opened from inside the app. Signed in, the guide and "Your data" open inside the signed-in app (`SignedIn`), so it stays open behind them; before signing in or agreeing to consent they open on their own |
| No sleep stages (8 Oct 2026) | A day with no night whose only sleep is at least 2 hours of plain "asleep" gets `no_sleep_stages` (D87; migration `20261016000000_no_sleep_stages.sql`, `rebuild_status`; the reference's `stageless_nights`) |

### Open questions (each with a recommended default)
1. **Region.** Settled 2 October 2026: US East (see Decisions).
2. **Retention after the test.** Default: delete testers' data 90 days after it ends unless they agree otherwise.
3. **Push library.** Settled 3 October 2026: `@negrel/webpush` 0.5.0 works in Supabase's function runtime and with Apple's push service (Phase 1a spike), so the fallback isn't needed.
4. **Limits.**
   - **Default:** 5 MB and 50,000 readings per upload. **Agreed (3 October 2026):** 60 uploads an hour per token, plus 200 import uploads and 200 pings an hour, each counted separately (D47).
   - **Default:** value ranges as in section 6.
5. **Weekly digest timing.** Default: Monday at 5am local time.
6. **Open spike results.** Phase 1's results are in progress.md ("Spike results"). Settled: Watch sleep stages arrive by name; past readings lose their time zone (trips come from the calendar instead); Shortcuts can only search Health by whole days (D43); readings travel as columns (D42); a year imports through the Shortcut in monthly parts (1c); HRV is present on nearly every tracked night (1c). Still open: the locked-phone rate (until about 10 October 2026).
