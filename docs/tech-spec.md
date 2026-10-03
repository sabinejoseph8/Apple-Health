# Tech Spec: Clarivi

**Status:** Agreed, v1.0 (30 September 2026)
**Last updated:** 3 October 2026 (Phase 1a built and live; Phase 1b upload path built and live, with the column post format (D42) and the server-side heart-rate window (D43), recorded in sections 3 to 10)
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
| `workouts` | Owner only, for the Signal check | `id`, `user_id`, `activity`, `start_at`, `end_at`, `duration_min`, `avg_hr` |

Built in Phase 1b (3 October 2026):
- `upload_tokens`: at most one working token per user (a unique index on unrevoked tokens). The app can read when its token was made and last used, but never the hash (column-level grants).
- `uploads` also logs rejected posts from a known token (a replaced token, or a body the function refused, with the reason), so a broken Shortcut shows up in the log. `run_trigger`, `local_date` and `night_complete` were added to measure locked-phone runs and answer "already synced today?".
- `samples.sample_hash` is a SHA-256 of the type, start, end, value, stage and source. The time zone isn't part of it, so the same moment posted from another time zone is the same reading. Heart rate is stored only from 6pm to noon, by each reading's own local time (D43). Sleep readings arrive with no source: Shortcuts doesn't report one for sleep (Phase 1b), so Watch sleep is recognised by its stages (core, deep, REM, awake) for D10.
- All writes go through two database functions callable only with the secret key: `ingest_upload(token_hash, upload, error)` and `issue_upload_token(user, token_hash)`.

**Results (always rebuildable from raw data)**
| Table | Holds | Key fields |
|---|---|---|
| `nights` | One row per user per night | `night_date` (local date of waking), `sleep_start`, `sleep_end`, `asleep_min`, `finished`, `sleeping_hr` (median while asleep), `hrv_median`, `hrv_count`, `resp_rate`, `resting_hr_prev_day`, `coverage`, `confidence` |
| `baselines` | Per night and reading | `night_date`, `metric`, `median_28`, `mad_scaled`, `valid_nights`, `range_low`, `range_high`, `building` |
| `daily_status` | The answer for each day | `date`, `status` (ready, ease_off, rest, none), `no_status_reason` (waiting, night_unfinished, no_sync, not_enough_data, learning), `readings_used`, `points` (per reading), `total`, `nudge`, `reason_codes`, `composite_fired`, `composite_inputs`, `is_late`, `settings_version`, `computed_at` |
| `insights` | The shared module output | `date`, `module`, `metric`, `value`, `baseline`, `deviation`, `severity`, `explanation_code`, `payload` |
| `digests` | Weekly summaries | `week_start`, `facts`, `text`, `created_at` |

**User answers and logs**
| Table | Holds | Key fields |
|---|---|---|
| `checkins` | Daily check-in, every change kept | `date`, `answer`, `answered_at`, `status_seen_before`, `is_first` |
| `followthrough` | Nudge answers, every change kept | `date`, `answer`, `answered_at`, `channel` (push, card, next_morning) |
| `notifications` | Outbox and delivery log | `user_id`, `date`, `kind` (morning, reminder, followup), `status` (pending, sent, failed), `payload`, `sent_at`, `tapped_at`, `error`; unique on (`user_id`, `date`, `kind`) |
| `usage_events` | Card views, Why today and trend opens, digest opens, sign-ins | `event`, `at`, `meta` (never health values) |

**Owner and research**
| Table | Holds | Key fields |
|---|---|---|
| `events` | Illness, major events, travel | `date`, `type`, `note`, `source` (manual, detected) |
| `experiments` | Future register for the causal layer (empty in v1) | `hypothesis`, `outcome_metric`, `baseline_window`, `test_window`, `status`, timestamps |
| `score_settings` | Weights, zone limits, windows, versioned | `version`, `weights`, `ease_off_at`, `rest_at`, `window_nights`, `min_valid_nights`, `per_metric_overrides`, `frozen`, `active` |
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
  - `night_complete`: true when this post completed last night. Starting rule for Phase 1b: last night's sleep has arrived and its last asleep reading (core, deep, REM or unspecified) ended between midnight and noon local time, at least 10 minutes before the post (decided 3 October 2026; Phase 2 builds the full rule).
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
  - `submit_checkin(answer)`
  - `submit_followthrough(date, answer)` (accepted only from 8pm on change days, and until the next morning)
  - `register_push(subscription)`
  - `log_usage(event)`

### Web app to server functions
Each call carries the user's session.
- **`account-token`:** checks the password, then creates or reissues the upload token. The token is returned once.
- **`account-delete-data`:** checks the password, then deletes the user's readings, results, answers, tokens and subscriptions. The account itself stays.
- **`account-first-login`:** takes the new password, refuses one under 12 characters or the temporary password itself, then saves it and clears the change-password flag in one step. Saving a password ends every session, so the app signs straight back in with the new one.
- **`send-push`:** in Phase 1a, sends a test notification to the signed-in user's own devices after an optional delay (up to 30 seconds), replying at once and sending in the background. Phase 4 extends it to send outbox rows on a schedule.
- **`owner-status`:** owner only. Returns per-user sync, reminder, delivery and import status, with no health values.

### Schedulers
- **Every minute:** `run_analysis_queue()` processes queued work, then writes morning notifications to the outbox.
- **Every minute:** calls `send-push`, which sends pending outbox rows.
- **Every 5 minutes:** `plan_notifications()` adds 11:30 reminders and 8pm follow-ups for users whose local time has reached them.
- **Weekly (Monday, 5am local, Default):** `build_digests()`.

### Owner administration
- Create accounts in the Supabase dashboard with a temporary password, marked as confirmed so no email is sent.
- A short admin script (Supabase admin interface) resets a password and sets the change-password flag again.
- Events for the owner's year are loaded from a small file with a script.

### Wording
- One shared wording module, `supabase/functions/_shared/wording.ts`, holds every sentence the app and notifications use: briefings, verdicts, nudges, notification text and state messages. It is plain TypeScript, so the web app and the server functions import the same file.
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
  - A 30-day inactivity timeout needs Supabase Pro, so it isn't enforced during the test. Until the move to Pro, a session lasts until the user signs out or uses "Sign out everywhere". The product spec's 30-day default (R6) applies from then on.
  - "Sign out everywhere" ends every session for the user.
- First sign-in: the change-password flag sends the user straight to "Set a new password". The flag is cleared only by `account-first-login`, in the same step that saves the new password.
- Password re-checks before sensitive actions are done by the server function signing in with the password. Supabase's built-in re-authentication sends an email code, and there is no email in this app.

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
- The secret key and the push signing key (VAPID private key) are kept only in Supabase's secret store, with one exception: Vercel's Supabase integration (D21) copies the secret key, the database password and connection addresses, and the token-signing secret into Vercel's encrypted settings. The app never reads them (decided 2 October 2026).
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
- Expected cost during the build and the test: nothing (Supabase free plan, Vercel Hobby, local copy of Supabase). After the test, Supabase Pro costs about $25 a month.
- An owner alert fires when the database passes 400 MB (Default; the free limit is 500 MB).

**Privacy**
- HTTPS everywhere. Encryption at rest on every Supabase plan.
- The free plan has no automatic backups (checked against Supabase's documentation, 30 September 2026). A backup copy of the database is made with the Supabase CLI's `db dump` command, as Supabase recommends for free projects, and saved to an encrypted folder on your laptop at least weekly and before every database change (Default), and one restore is practised before the test. Backups are never stored in GitHub or CI.
- No third-party scripts. A strict Content Security Policy on the web app blocks outside scripts.
- Usage logs hold no health values.
- Retention: testers' data is deleted 90 days after the test ends unless they agree otherwise (Default).

---

## 7. Hosting, deployment and configuration

**Environments (decided 30 September 2026: one Supabase project)**
| Environment | Supabase | Web app | Used for |
|---|---|---|---|
| Local | A local copy on your laptop and in CI, with made-up test data. Unlike the live project, it doesn't switch row-level security on automatically for new tables, so the CI check still catches a table without it | Runs on your laptop | Building and testing every database change before it goes live |
| Live | The one Supabase project; free while building and through the test, Pro after the test | Vercel production address and preview addresses | Spikes, real data for the four users, and checking changes on your phone |

- Region: US East (`us-east-1`), the closest to the Cayman Islands.
- **Live project (created 2 October 2026):** Supabase project "Clarivi", ref `vuynnnrijdbvamwfauog`, address `https://vuynnnrijdbvamwfauog.supabase.co`, free plan, US East. It replaced a project created in US West by mistake (ref `pupxkjhhhgeeoqyvtsst`), which is no longer used.
- **Repository:** `github.com/sabinejoseph8/Apple-Health`, public. It must never hold secrets or backups.
- **Vercel and Supabase:** connected through Vercel's official Supabase integration (D21), which fills in the project address and keys for the web app.
- **Production address:** https://clarivi-zeta.vercel.app (Vercel project `clarivi`). It is also the push contact address (`VAPID_SUBJECT`).
- Vercel previews talk to the same live project, so preview checks are done signed in as the owner or a test account, never as a tester.
- A dedicated test account (created 3 October 2026; its email is kept out of this public repository) holds made-up data for checking previews.
- The live project was created with Supabase's automatic row-level security for new tables (an event trigger, `rls_auto_enable`). Outside calls to that function are revoked (migration of 3 October 2026).

**Deployment**
1. A change goes on a branch. GitHub Actions runs three checks on every push: the app (type check, unit tests, build with the secret check), the database (row-level security and cross-user tests against a local copy of Supabase) and end to end (Playwright in WebKit at iPhone size).
2. Vercel builds a preview, pointed at the live project. You check it on your iPhone, signed in as the owner or the test account.
3. Database changes are applied to the live project only at release, and only in a backward-compatible way: add new columns or tables first, remove old ones in a later release, so the live app and a preview never break each other.
4. Before any database change during the test, take a manual backup to your encrypted laptop folder (the free plan has no automatic backups).
5. Server functions are deployed at the same time as their matching database change.
6. Merging to `main` publishes the web app to production.
7. Releases are tagged and listed in a changelog. During the test, score logic and settings are frozen.

How a release reaches the live project: sign the Supabase command-line tool in once on the laptop (`npx supabase login`, approved in the browser with a verification code), link the folder to the project, then `supabase db push` for migrations (no database password needed), `supabase functions deploy` for functions and `supabase secrets set` for function settings.

**Configuration**
- **Web app:**
  - the project address and the publishable key, filled in by Vercel's Supabase integration under its own names (for example `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); the build maps them to `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_VAPID_PUBLIC_KEY`, added by hand (Production and Preview)
  - the integration fills in Production only, so `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` were also added by hand for Preview (3 October 2026). If the project's keys are ever rotated, update these two as well.
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
- **Server function tests (Deno):** ingest validation, duplicates, the reply flags, rate limits, password re-checks and delete-my-data. Run with `npm run test:functions` (Deno comes from npm, so nothing extra to install). Built in 1b: the post schema (both shapes, the heart-rate window, time zones, ranges), the ingest handler (token hashing, size limit, replies and the exact text the Shortcut looks for) and token generation.
- **Shortcut checks (Python):** `python3 scripts/shortcut/test_build_shortcut.py` checks the generated Shortcut is well formed (every variable wired to an earlier action, blocks closed, valid JSON, token asked for at install, no loops, whole-day searches). Runs on every push.
- **Reference check (pandas):** the owner's year is recalculated outside the database, stage by stage (nights, sleeping heart rate, baselines, status). It must match the SQL before any tester sees a status, and is rerun after any change to the SQL.
- **Front-end tests (Vitest):** state selection (which card state shows when) and the wording module rules.
- **End-to-end tests (Playwright, iPhone screen size):** set up on 3 October 2026 (`npm run test:e2e`, tests in `e2e/`). They run in WebKit, Safari's engine, on an iPhone 14-sized screen (390 points wide), locally and on GitHub with every push. The first tests cover the sign-in screen: its form and contact line, no sideways scrolling, 44-point tap targets, and the manifest, icon and service worker. Still to come:
  - every card state, Why today and the numbers toggles
  - follow-through timing, with the clock set to before and after 8pm
  - the check that the morning card fits in 390 by 763 points
- **Manual checks on real iPhones:**
  - install, sign in and Keychain autofill
  - notification taps
  - both Shortcut triggers, with the phone locked and unlocked
  - import timing, and an interrupted import resuming
- **Local end-to-end check** (`npm run check:local`, Phase 1a): with the local copy and functions running, it signs in made-up accounts, runs the password change, sends a test push to a fake device that decrypts it, and checks a second account sees nothing of the first.
- **Local sync check** (`npm run check:local:sync`, Phase 1b): with the local copy and functions running, it creates a token with a password check, posts the way the Shortcut does (ping, daily post in rows and in columns, a repeat, readings set aside), reissues the token, and checks a second account sees nothing. Since the Phase 1 code review it runs on every push, with the import load check (`npm run check:local:import`), in the "Local end to end" GitHub job, which starts the local copy and the functions.
- **Build secret check:** see pattern 12.
- **Code review at the end of each phase:** everything the phase changed is reviewed for bugs and security problems, findings are fixed, and the phase's automated tests are re-run before the phase is called done (added 3 October 2026).
- **Every push runs all automated tests.** A failure blocks the release.

---

## 9. Critical risks and challenges

The riskiest items sit in the earliest phases. Phase names are proposals for progress.md: 1 Spikes, 2 Data and analysis, 3 Card and Why today, 4 Notifications and follow-through, 5 Trends, digest, settings and owner page, 6 Hardening and dry run, 7 Four-week test.

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
| SQL statistics subtly wrong | Confident wrong nudges | Stage-by-stage pandas check on the owner's year before testers start | 2 |
| HRV readings too sparse at night | The heaviest-weighted reading is often missing, or its baseline never finishes building | Count nights with HRV at the import; adjust the weights, the minimum (14 nights) or the window (42 nights) before freezing the settings. Phase 1c (3 October 2026): 239 of Sabine's 240 tracked nights (99.6%) have HRV during sleep, median 3 readings a night | 2 |
| Score settings unproven | Too many or too few Ease off days | Set from the owner's year against disrupted days and the "1 day in 7" limit; then freeze | 2 |
| Heavy recompute times out | Imports stall | Queue work, process one month at a time, never inside the upload request | 2 |
| Previews and changes touching real testers' data (one project) | A bad preview or database change could damage the test data | Build and test every database change on a local copy first; apply changes only at release and backward-compatibly; check previews as the owner or a test account; back up before every change during the test | 1 |
| Free plan during the test: no automatic backups, and the project can pause | Lost testers' data would end the test; a paused project stops syncs | Daily syncs keep the project active; manual backups at least weekly and before every change; practise one restore in phase 6; check the project is active each morning on the owner page; move to Pro after the test | 6 |
| The inactivity timeout needs Pro | Sessions don't expire through inactivity during the test | Accepted for the test; "Sign out everywhere" is available; switch the timeout on after the move to Pro | 6 |
| Lock-screen text shows health detail | Privacy concern for testers | Status and reason only in the morning; nothing in reminders and follow-ups; consent and the "When Unlocked" guide | 4 |
| Wording drifts into medical claims | Health-adjacent responsibility | One wording module with forbidden-term tests | 3 |
| iOS or Shortcuts updates change behaviour mid-test | Syncs break for everyone at once | Freeze phone updates where testers agree; owner page flags missed syncs the same day | 7 |
| Health data stored outside the Cayman Islands | Data-protection rules may apply to sensitive data and transfers abroad | Check the Cayman Data Protection Act before the test; consent covers storage in the US; not legal advice | 6 |

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

### Open questions (each with a recommended default)
1. **Region.** Settled 2 October 2026: US East (see Decisions).
2. **Retention after the test.** Default: delete testers' data 90 days after it ends unless they agree otherwise.
3. **Push library.** Settled 3 October 2026: `@negrel/webpush` 0.5.0 works in Supabase's function runtime and with Apple's push service (Phase 1a spike), so the fallback isn't needed.
4. **Limits.**
   - **Default:** 5 MB and 50,000 readings per upload. **Agreed (3 October 2026):** 60 uploads an hour per token, plus 200 import uploads and 200 pings an hour, each counted separately (D47).
   - **Default:** value ranges as in section 6.
5. **Weekly digest timing.** Default: Monday at 5am local time.
6. **Open spike results.** Phase 1a's and 1b's results are in progress.md ("Spike results"). Settled in 1b so far: Watch sleep stages arrive by name; past readings lose their time zone (trips come from the calendar instead); Shortcuts can only search Health by whole days (D43); readings travel as columns (D42). Still open: the locked-phone rate, the "already synced" check on real mornings, and HRV coverage (Phases 1b and 1c). The plan above assumes they work, with the fallbacks listed in section 9.
