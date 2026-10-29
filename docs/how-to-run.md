# How to run Clarivi

This guide is for a reader who wants to see how Clarivi is checked, not to use it. Clarivi is a personal app that reads one person's Apple Watch data, so this repository holds no health data and every check here runs on made-up data. Steps 1 and 2 need nothing installed beyond Python 3.

## Before you start

1. For steps 1 and 2: Python 3. The checks use only its standard library.
2. For steps 3 to 6: Node.js 24, Docker Desktop (it runs a throwaway local copy of the database) and, for step 5, Python 3 with `pip`.
3. Download or clone this repository.
4. No keys are needed. The tests use a local, throwaway database with made-up accounts. The project's real keys live only in Supabase's secret store and are never in the repository.

## See it working

| Step | You do | What happens |
|---|---|---|
| 1 | Open [docs/architecture.png](architecture.png) | One page showing how a night of Apple Watch readings becomes a morning answer, where the AI sits and where quality is checked |
| 2 | `python3 checks/run_all.py` | A list of checks on this repository: required files, links, no em dashes in public writing, private files not tracked, no secrets and no personal email addresses in tracked files |
| 3 | `npm ci`, then `npm test` | The unit tests for the app's logic and wording |
| 4 | `npx supabase start`, then `npm run db:test` | The database tests: row-level security on every table, and that one person can never read another's rows |
| 5 | `python3 -m pip install -r scripts/reference/requirements.txt`, then `python3 scripts/reference/check.py --local-synthetic` | Builds a throwaway account with a made-up year of readings on the local database, recalculates it independently with pandas and compares every value. It ends with "The database and the reference agree." |
| 6 | `npx playwright install webkit`, then `npm run test:e2e` | The screen tests at iPhone size, with made-up data |
| 7 | In a second window `npx supabase functions serve`, then `python3 scripts/reference/privacy_check.py --local` | Checks the privacy rules from the outside, as real people, using two made-up accounts it creates and deletes: signed out sees nothing, signed in sees only their own rows, nobody can write to a table directly. It prints PASS lines and ends with `0 failed` |

Run step 4's `npx supabase start` before steps 5 and 7. Stop the local database afterwards with `npm run db:stop`.

## Run the checks

```bash
python3 checks/run_all.py
```

It should end with `0 failed`. While the portfolio package is still being built, it checks only the files that exist so far; `checks/portfolio.json` says which, and what is still to be added. The one contact address in the consent text is listed in that file on purpose, so it is not flagged. Every other address still is.

A second script looks for anything that should not be public, including in the Git history:

```bash
python3 checks/prepublish_scan.py --history
```

## Reproduce the evaluation

The written evaluation, with the targets and the results of both test weeks, is added after week two. Until then, what can be reproduced from a clone is:

- The AI test cases are in [docs/ai-eval/](ai-eval/README.md): invented cases and how they are used. Running them needs the project's own AI function and its owner sign-in.
- The reference check on made-up data is step 5 above.

Two things cannot be run from a clone, because they read the owner's own data: `scripts/reference/check.py --live` (the reference check on the owner's real year) and `scripts/reference/week-results.sql` (the test week's targets, counted from the live logs). Their results, with the counting rules, are recorded in [docs/mvp.md](mvp.md).

## Troubleshooting

- `npx supabase start` fails: Docker Desktop must be running.
- The database tests fail after a change to a migration: `npx supabase db reset --local` rebuilds the local database, then run the tests again.
- Playwright cannot find WebKit: `npx playwright install webkit`.
- A check named "privacy check" cannot reach the functions: it needs `npx supabase functions serve` running in another window.
- `npm run build` stops with a message about a secret: that is the build's own check that only the three public values can reach the browser.
