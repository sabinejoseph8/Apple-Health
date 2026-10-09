# Clarivi

Clarivi is a small iPhone web app, installed to the home screen, that turns a person's own Apple Watch data into a plain-words morning answer: what last night's readings mean against their own normal, why today's status was set, and one action for today. Version 1 is a one-week test with one user, Sabine (the owner), since 8 October 2026 (D89, shortened from two weeks to one by D91; first planned as four weeks with Sabine and three testers).

## Where the plan lives

The agreed plan is in `docs/`. Read the files a task needs before starting it.

- `docs/progress.md`: the phased build plan, with tasks, automated tests and manual checks. Work from this file.
- `docs/product-spec.md`: what the app must do (requirements R1 to R67).
- `docs/design.md`: colours, type, spacing, components and screens. The designed screens are in the "Clarivi Screens" canvas: https://claude.ai/artifact/Xc7im7cUsqwwkDbyQRYt8E
- `docs/design-screens.html`: a copy of the Clarivi Screens canvas (open it in a browser): the readiness card at 6:50am and 8pm, Why today, and Why today with the numbers open, all on the sample day of Tuesday 29 September. Use it for exact layout, wording and sample values.
- `docs/clarivi-flow.html`: the daily morning loop step by step, the six views it needs and every state each view can be in.
- `docs/tech-spec.md`: architecture, data model, interfaces, security, hosting and testing.
- `docs/cayman-data-protection.md`, `docs/consent-draft.md` and `docs/privacy-impact-assessment.md`: the data protection research for every place testers may live (not legal advice), the approved consent text (in the app as `wording.consent`) and the assessment of storing testers' data in the US.
- `docs/mvp.md`: the MVP scoping document, with the success criteria (D9), risks (R1 to R25; these are risk numbers, not the requirement numbers R1 to R67 in `docs/product-spec.md`) and decisions (D1 onwards) behind the plan. Use it for why something was decided, and keep it up to date as the project progresses (see Project memory). If it disagrees with the four plan files above, they win, since they are the agreed versions: update the MVP document to match.

If the docs and the code disagree, or a task needs a decision the docs don't make, stop and ask Sabine. Don't change an agreed decision on your own.

## Project memory

These five files in `docs/` are the project memory: the key to understanding the project and continuing it effectively.

- `docs/product-spec.md`: core requirements and goals.
- `docs/design.md`: design principles, colour, type and spacing tokens, and component anatomy, matching the "Clarivi Screens" canvas.
- `docs/tech-spec.md`: key technical decisions and system patterns to stay consistent with.
- `docs/progress.md`: current focus, recent changes, what's left to build, current status and known issues.
- `docs/mvp.md`: the MVP scope, success criteria, risks and decisions (D1 onwards). Record new or changed decisions, risks, assumptions and spike results here as the project progresses.

Update the project memory:
- when you discover a new project pattern
- after implementing a significant change
- after completing a major phase of work
- when a technical decision is made (record decisions Sabine has made; never change an agreed decision without her)
- when Sabine says "update proj memory"

When Sabine says "update proj memory", review every one of the five files, even if some need no change. Keep them precise and clear: building the project well depends on them.

## Interview notes

Maintain a file called `interview-notes.md` (in the project root). Keep it written in the first person, as if Sabine is telling a PM interview story. Include:

- who the app is for and why
- key decisions and tradeoffs
- major bugs and how she fixed them
- significant improvements

Update this file whenever there is a significant new feature, a major bug resolved, or a meaningful design change. The repository is public, so the notes never include passwords, keys, account email addresses or anyone's health readings.

## How to work with Sabine

- Sabine is not a developer. Explain what you're doing in plain words and keep updates short.
- Never use em dashes in anything you write for her.
- Work one task group at a time from `docs/progress.md` (1a, then 1b, then 1c, and so on). Start each group with a plan and wait for her approval before changing files.
- When a step needs her (a dashboard setting, an account, a sign-in, something on her iPhone), say so clearly and give one step at a time.
- Before saying a task group is done, run the automated tests listed for its phase, then walk her through the manual verification steps.
- At the end of each phase (after its last task group), run a code review of everything the phase changed, using the code-review skill. Fix what it finds, re-run the phase's automated tests, then tell Sabine in plain words what was found and what was fixed. Only then tick the phase's code-review task and call the phase done. Anything the review raises that needs a decision goes to Sabine first.
- When a task is done and its checks pass, change its `- [ ]` to `- [x]` in `docs/progress.md`, tick it on the Clarivi Memory site too (https://claude.ai/artifact/5Aw5x3PYAro7pDXQRkapTe), and update the Summary at the top of `docs/progress.md`.
- Commit small, working changes with clear messages, and push to GitHub at the end of each task group.

## Stack (details in docs/tech-spec.md)

- Front end: React + TypeScript + Vite single-page app, with a web app manifest and a hand-written service worker. Plain CSS, with design tokens from `docs/design.md` as CSS variables. Hosted on Vercel (Hobby plan).
- Back end: Supabase (Postgres with row-level security, Auth with email and password, Edge Functions in Deno, pg_cron, pg_net).
- Web push: VAPID keys with `@negrel/webpush`; fall back to `npm:web-push` if it fails.
- Tests: Vitest, Playwright, pgTAP through the Supabase CLI, Deno test, and pandas for the reference check.

## Supabase

- Live project: "Clarivi", ref `vuynnnrijdbvamwfauog`, Pro plan since 9 October 2026 (D90; free before), in US East (`us-east-1`). It replaced the earlier US West project (ref `pupxkjhhhgeeoqyvtsst`), which is no longer used.
- Build and test every database change on the local copy first (`supabase start`, which needs Docker Desktop running). Keep migrations in `supabase/migrations/`.
- Apply changes to the live project only at release, in a backward-compatible way, and only after asking Sabine. During the one-week test, take a backup first.
- Every table has row-level security. Never turn it off.

## Safety rules

- The GitHub repository is public. Never commit secrets, `.env` files, health data, Apple Health exports or database backups.
- The Supabase secret key and the VAPID private key live only in Supabase's secret store, with no exceptions: since 5 October 2026 (D81) Vercel has no Supabase connection and holds only the three public values, set by hand. The build reads exactly three values by name (project address, publishable key, VAPID public key), so only those reach the browser. Never reconnect Vercel's Supabase integration: it copies the secret values into Vercel.
- No third-party scripts, analytics or tracking.
- No screen or notification names a medical condition or suggests a diagnosis (R61). All user-facing wording lives in one wording module with tests.
