# Evaluation: Clarivi

This is the first half, written on 29 October 2026, before week two of the test begins. It sets down what good looks like and how it is counted, with week one's results, the AI feature's test results and the module check. Week two's results are added to section 3 after it ends, using the same rules. No reading from anyone's Watch appears here: only totals and counts.

## 1. What good looks like

Set on 29 September 2026 (decision D9 in [mvp.md](mvp.md), numbers in [product-spec.md](product-spec.md), section 9), before any result existed.

| Measure | Why it matters to the user | Target | Measured on |
|---|---|---|---|
| Sync | The status only helps if last night is in by the morning | A successful morning sync on at least 6 of 7 days | The uploads log |
| Notifications | A nudge only helps if it is seen | Delivered on at least 90% of synced days that have a status | The notification log |
| Isolation | One person's health data must never reach another | No tolerance | Database tests, an outside-in privacy check and the live database's settings |
| Correctness | A wrong number makes the status meaningless | The calculations match an independent pandas reference on the owner's year, and no unfinished night is ever scored | The reference check, and a query on the status table |
| Signal, owner's year | Does the score notice a night that really was disrupted | At least 2 in 3 objectively disrupted days called Ease off or Rest | The owner's year, with disrupted days defined in advance (D55, D60) |
| Quiet by default | A score that says "ease off" too often gets ignored | Ease off and Rest together on no more than about 1 day in 7 | The status shown each day, and the owner's year |
| Check-ins against status | Does the status agree with how she feels | Agree more often than chance, on days that have a status | The first check-in, taken before the status is seen |
| Engagement | Does she use it | Opens the card or taps the notification on at least 5 of 7 days | The app's usage log |
| Action | Does she act on the nudge | On change days, followed about half the time or more | The follow-through answers |
| Her account | Did it change a decision | A short written account at the end | Her own words |

**Changes to the targets.** On 8 October (D89) and 9 October 2026 (D91), both before any test result, the test shrank from four people over 28 days to one person over one week, so the sync target became 6 of 7 days (first 26 of 28) and engagement 5 of 7 days (first 5 a week). The retention target was dropped with the testers, and "her account" replaced their end-of-test conversations. After week one's results arrived, no target changed. One counting rule did: from week two, a "successful morning sync" means the status was worked out and shown before noon (D99, 29 October 2026, decided before week two and before any week-two result). Week one stays as recorded.

## 2. How it is measured

- **Data.** One real person, the owner, for the test weeks; her backfilled year of Watch data (261 nights) for the reference check and the Signal check; invented cases only for the AI (40 development cases and 20 held-out); and, for the module check, her year on a restored copy of a backup, in a local database that was wiped afterwards.
- **When the answers and rules were written.** The targets on 29 September. The counting rules for week one were written into the header of `scripts/reference/week-results.sql` on 29 October, before the numbers were computed, and week two reruns the same file. The AI test set was written on 29 October before any prompt or filter existed; the held-out part was written by a fresh session that had seen only the method and the input shape, and was never opened by the build session. The module check's criteria were fixed before it was run.
- **Method.** `week-results.sql` counts a test week's targets from the live logs. `scripts/reference/check.py` recalculates nights, usual ranges and the daily status in pandas and compares every value with the database. The database tests and `scripts/reference/privacy_check.py` test isolation. `scripts/ai-eval/run_eval.py` sends the invented cases through the deployed AI function and reports which checks failed.
- **Reproduce.** From a clone, the reference check on made-up data and the isolation tests run with the commands in [how-to-run.md](how-to-run.md). The checks that read the owner's own data (`check.py --live`, `week-results.sql`) cannot be run from a clone; their results and counting rules are recorded in [mvp.md](mvp.md).
- **Separation.** One assistant session built the app and also calculated week one's numbers, so the separation here is by written rules, not by a second person. The sealed AI cases were written by one fresh session and graded by another. There was no independent reviewer of the week-one count.

## 3. Results

### Week one (19 to 25 October 2026), calculated 29 October 2026

Statuses are the ones she was shown (score version 2). The score had not changed during the week.

| Measure | Target | Result | Met? | Caveat |
|---|---|---|---|---|
| Sync | 6 of 7 days | 4 of 7 days had an accepted post; the status was shown before noon on 2 of 7; a post carried the whole night on 2 of 7 | No | The 4 of 7 counts any accepted post, as recorded on 29 October; the stricter counts are lower. She did not run the sync on the last three days. |
| Notifications | 90% | 2 of 2 days that had a status | Yes | Two days only. No tap was logged, and taps are not part of this target. |
| Isolation | No tolerance | 461 database checks and 133 outside-in checks pass; all 22 live tables have row-level security | Yes | One real user, so isolation between people was shown with two made-up accounts. |
| Correctness | Match the reference; no unfinished night scored | 261 nights, 1,305 usual ranges and 262 days agree, 0 values differ; 0 of 234 days with a status used an unfinished night | Yes | The reference was written by the same author as the app. It is independent code, not an independent person. |
| Signal, owner's year | 2 in 3 | 2 of 13 disrupted mornings with a status called Ease off or Rest (15%) under score version 3; 1 of 13 under version 2 | No | The year has no calendar illness or major events (D58), and an easier workout may have been easier by choice. |
| Quiet by default | About 1 day in 7 | Week: 0 of 2 days shown. Year: 52 of 231 days under version 3 (22%, about 1 in 4.4); 29 of 231 under version 2 (13%) | Week: indicative only. Year, version 3: No | The week had two days with a status. The miss on her year is the price of the sleep floor (D96), reported as a miss. |
| Check-ins against status | More than chance | 2 of 2 first answers agreed | Indicative only | Both statuses were Ready, so the week could not show agreement beyond chance. |
| Engagement | 5 of 7 days | 3 of 7 days | No | No notification tap was logged. |
| Action | About half | No Ease off or Rest was shown, so no question was asked | Not measurable | |
| Her account | Written | Written and approved 29 October 2026 | Yes | In her words: she would not keep using it as it was, because of remembering to sync and because after the noon cutoff the card gives no status. |

Also from week one: check-ins were answered on 3 of the 3 days the card was opened, and no day rested on fewer than three readings.

### Before week two: the alarm trigger's first real morning (30 October 2026)

The alarm trigger is the one change made after week one to help the sync target, so it was tried on a real morning before week two. **It started but did not sync.** The log shows its ping at 11:06am; its run then ended without a post, because Shortcuts timed out the 10-minute wait and met a locked phone, which cannot read Health. The night was not in Health anyway: its sleep stages first reached the server in a post at 11:38am, more than two hours after the Watch's sleep had ended. The app-open run at 11:38am completed the sync, and the status was worked out and sent before noon. This is a pre-week-two check, not a week-two result, and it is one morning.

### Week two

To be added after it ends, using the same file and the same rules. Its sync target is counted as the status worked out and shown before noon (D99).

### The AI explanations (invented cases, Claude Opus 5.5)

| Run | Result | Caveat |
|---|---|---|
| 40 development cases, instruction version 2, 29 October | 40 of 40 passed the filter after the digest was made words only (39 of 40 before) | The instruction and filter were tuned on these cases. |
| 20 held-out cases, written and graded by separate fresh sessions | 20 of 20 passed the filter; every judged check passed except "matches the numbers", 19 of 20 (one digest said sleep got longer each night when it had dipped midweek); 15 of 20 read plainly at the top score and 5 at the middle score | The filter was tightened after this set was graded, so its filter result is in-sample for the added words. |
| 40 development cases, live, after the filter was tightened and the digest's second-model check was added | 38 of 40 passed on a single attempt | Not comparable with the first run. Both misses were digests: one true sentence refused for the word "because" (a strict false alarm), and one refused by the second-model check for a trend the data did not show. In the app each would be retried once, then replaced by fixed wording. |

Time per answer was about 2 seconds in the middle and under 6 seconds at the slowest, and about 1 cent each. The method, traps and limits are in [ai-eval/README.md](ai-eval/README.md).

### The three analysis modules (tested before building, on the owner's year)

| Module | Result |
|---|---|
| Sleep need | Not supported: 0 of 12 combinations. Her Watch's sleep rarely reaches 7.5 hours, so the data cannot show where more sleep helps. |
| Lagged relationships | Not supported: 0 of 12. Her workouts file ended on 2 October and the live sync sends none. |
| Change detection | Partly supported: shifts of 1.5 spreads or more were found within 14 nights in about two thirds of tries; a one-spread shift within 7 nights only 10% of the time, against a target of 80%. |

None was built (decided 29 October 2026).

## 4. Caveats and limits

- **Sample size.** One person for one week. Two days had a status shown, three had a check-in, and no day was a change day. This can say whether the pipeline works; it cannot say whether the tool changes behaviour.
- **Blindness.** The same author built the system and counted the results. The counting rules were written first and the counts can be rerun, but nobody else checked them.
- **In-sample results.** The AI instruction and filter were tuned on the development cases. The filter was tightened after the held-out set was graded, so the held-out result is partly in-sample.
- **No outside user.** Nobody but the owner used it, so engagement and retention say nothing about other people.
- **Signal evidence is thin.** The owner's year has no calendar illness or major events, so the Signal check rests on one trip and on workouts far below her usual.
- **The Watch decides when the night arrives.** The Watch's sleep reached the iPhone's Health hours after waking on 30 October, and week one's log showed the same on 20 October. Clarivi cannot see that moment, so any sync target depends on something it does not control, and a fixed wait cannot fix it.
- **Not measured yet.** Week two. The quality of the AI's wording on real nights, which the owner judges by reading it in week two. Isolation between two real people.

## 5. What the results changed

- Week one's sync miss, and a log showing that even automatic runs often stopped before the night was complete, led to a third trigger that runs when the alarm is stopped, with a 10-minute wait (D94).
- A Ready status on a very short night, seen in the self-test on 3 October and again in week one, led to the sleep floor in score version 3 (D96). It made the quiet-by-default target miss on her year, which is reported as a miss.
- Counting the sync three ways showed that "4 of 7" counted any post and only 2 of 7 days had a status before noon, which led to D99 for week two.
- The held-out set's one slip, a digest describing a day-to-day change the data did not show, led to a second model checking every claim in each digest before it is shown (D95).
- The module check led to dropping all three modules (D94, 29 October).
- The alarm trigger's first real morning, which started but did not sync because the 10-minute wait ended at a locked phone and the night had not reached Health, led to dropping the wait and to a reminder that also covers a night that is still unfinished (D103). The earlier reminder was silenced by a partial post, as on 22 and 30 October.
- Her account, that she would not keep using it as it was, points at the sync and the noon rule; the noon rule is reopened only if week two shows syncs still arriving after noon (D94).

## 6. Next

- Try the changed alarm run and reminder on a real morning (31 October, then week two), and add what the log shows here.
- Run week two with the same targets and rules, and add its results here.
- Read the week-two digests for slips like the one the held-out set found, and report what is found.
- A second real user, for isolation, engagement and Signal on a body other than the owner's.
- Workouts in the daily sync and a second year of data, before testing the modules again.
