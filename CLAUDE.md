# Clarivi

Clarivi is a small iPhone web app, installed to the home screen, that turns a person's own Apple Watch data into a plain-words morning answer: what last night's readings mean against their own normal, why today's status was set, and one action for today. Version 1 is a four-week test with four users: Sabine (the owner) and three testers.

## Where the plan lives

The agreed plan is in `docs/`. Read the files a task needs before starting it.

- `docs/progress.md`: the phased build plan, with tasks, automated tests and manual checks. Work from this file.
- `docs/product-spec.md`: what the app must do (requirements R1 to R67).
- `docs/design.md`: colours, type, spacing, components and screens. The designed screens are in the "Clarivi Screens" canvas: https://claude.ai/artifact/Xc7im7cUsqwwkDbyQRYt8E
- `docs/tech-spec.md`: architecture, data model, interfaces, security, hosting and testing.

If the docs and the code disagree, or a task needs a decision the docs don't make, stop and ask Sabine. Don't change an agreed decision on your own.

## How to work with Sabine

- Sabine is not a developer. Explain what you're doing in plain words and keep updates short.
- Never use em dashes in anything you write for her.
- Work one task group at a time from `docs/progress.md` (1a, then 1b, then 1c, and so on). Start each group with a plan and wait for her approval before changing files.
- When a step needs her (a dashboard setting, an account, a sign-in, something on her iPhone), say so clearly and give one step at a time.
- Before saying a task group is done, run the automated tests listed for its phase, then walk her through the manual verification steps.
- When a task is done and its checks pass, change its `- [ ]` to `- [x]` in `docs/progress.md` and update the Summary at the top of that file.
- Commit small, working changes with clear messages, and push to GitHub at the end of each task group.

## Stack (details in docs/tech-spec.md)

- Front end: React + TypeScript + Vite single-page app, with a web app manifest and a hand-written service worker. Plain CSS, with design tokens from `docs/design.md` as CSS variables. Hosted on Vercel (Hobby plan).
- Back end: Supabase (Postgres with row-level security, Auth with email and password, Edge Functions in Deno, pg_cron, pg_net).
- Web push: VAPID keys with `@negrel/webpush`; fall back to `npm:web-push` if it fails.
- Tests: Vitest, Playwright, pgTAP through the Supabase CLI, Deno test, and pandas for the reference check.

## Supabase

- Live project: "Clarivi", ref `pupxkjhhhgeeoqyvtsst`, free plan, created in US West (`us-west-2`). The region is an open question in `docs/progress.md`; if Sabine recreates the project in US East, update this line with the new ref.
- Build and test every database change on the local copy first (`supabase start`, which needs Docker Desktop running). Keep migrations in `supabase/migrations/`.
- Apply changes to the live project only at release, in a backward-compatible way, and only after asking Sabine. During the four-week test, take a backup first.
- Every table has row-level security. Never turn it off.

## Safety rules

- The GitHub repository is public. Never commit secrets, `.env` files, health data, Apple Health exports or database backups.
- The Supabase secret key and the VAPID private key live only in Supabase's secret store. The web app gets only the publishable key and the VAPID public key, through `VITE_` variables.
- No third-party scripts, analytics or tracking.
- No screen or notification names a medical condition or suggests a diagnosis (R61). All user-facing wording lives in one wording module with tests.
