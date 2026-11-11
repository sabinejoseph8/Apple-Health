# Evaluation: Clarivi

The first half was written on 29 October 2026, before week two of the test began. It sets down what good looks like and how it is counted, with week one's results, the AI feature's test results and the module check. Week two's results were added to section 3 on 11 November 2026, counted with the same file and the same rules, together with reruns of the isolation, correctness and Signal checks. No reading from anyone's Watch appears here: only totals and counts.

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
- **Separation.** One assistant session built the app and also calculated both weeks' numbers, so the separation here is by written rules, not by a second person. The sealed AI cases were written by one fresh session and graded by another. There was no independent reviewer of either week's count.

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

A second try on 31 October tested nothing: the Watch was not worn, so there was no night to sync, and the 11am alarm was not set, so no alarm run could start. The 11:30 reminder was still sent, because the server cannot tell a night without the Watch from a night that has not reached Health yet. The try was repeated on 1 November.

**The third try, on 1 November, passed after one fix.** The first alarm stop (the alarm was set for 10am for the test) started the alarm run, but the server refused its post as a replaced token: the alarm automation was still running the renamed old copy of the Shortcut, which held the retired token, while the charger and app automations already used the new one. That was a setup mistake, not a fault in the changed run. After the alarm automation was pointed at the new Shortcut, a second stop at 10:45 started the run, which sent its ping and the full post two seconds apart with the night complete. The status was worked out by 10:46, the explanation was saved seconds later and the notification was sent at 10:47, all well before noon. Limits: it is one morning; the night was already in Health, so it does not test a night that arrives late (the 11:30 reminder and the charger, app and Sync now runs cover that case); and the new reminder rule was not seen on a real morning, only in tests. Week two starts on Monday 2 November 2026.

### Week two (2 to 8 November 2026), calculated 8 November 2026

The same file, `scripts/reference/week-results.sql`, with only the week's start date changed. The targets are the ones set before week one; the sync count is the one chosen before week two (D99): the morning's status worked out and shown before noon. Statuses are the ones she was shown (score version 3). Nothing about the sync or the score changed during the week. The isolation, correctness and Signal checks were rerun on 10 and 11 November 2026.

| Measure | Target | Result | Met? | Caveat |
|---|---|---|---|---|
| Sync | 6 of 7 days | The status was shown before noon on 6 of 7 days; 6 of 7 had an accepted post, and on 6 a post carried the whole night | Yes | The miss, Saturday 7 November, was the phone's battery being dead until after 12pm, so nothing could sync before noon. It counts as a miss under the rule. Two of the six came only after the 11:30 reminder: Friday's status was shown five minutes before noon, Sunday's eleven. |
| Notifications | 90% | 6 of 6 days that had a status | Yes | |
| Isolation | No tolerance | 485 database checks and 133 outside-in checks pass; all 22 live tables have row-level security, and signed-out visitors can read and run nothing | Yes | Still one real user, so isolation between people was shown with the test account and made-up accounts, not a second real person. |
| Correctness | Match the reference; no unfinished night scored | 271 nights, 1,355 usual ranges and 273 days agree, 0 values differ; 0 of 244 days with a status used an unfinished night | Yes | The same author wrote the reference and the app. |
| Signal, owner's year | 2 in 3 | 2 of 13 disrupted mornings with a status called Ease off or Rest (15%) under score version 3 | No | Unchanged from week one: the 13 more days added no disrupted morning that was caught. Same limits as week one. |
| Quiet by default | About 1 day in 7 | Week: 0 of 6 days shown. Year to 10 November: 53 of 244 days under version 3 (22%, about 1 in 4.6) | Week: indicative only. Year, version 3: No | The week's only Ease off, Saturday, was worked out on Sunday from the past days and never shown. |
| Check-ins against status | More than chance | 3 of 6 first answers agreed | Indicative only | Every status shown was Ready, so this only shows how often she felt great or okay on a Ready day. |
| Engagement | 5 of 7 days | 7 of 7 days | Yes | On Saturday the card was opened although no status could be shown. |
| Action | About half | No Ease off or Rest was shown, so no question was asked | Not measurable | Untested for the second week running. |
| Her account | Written | Written and approved 11 November 2026 | Yes | Below. |

**Her account (week two):** "The morning status still needed me to sync by hand, or relied on the alarm, and it had to happen before noon. I don't set an alarm on most days, so the alarm route didn't fit how I actually live."

Also from week two:

- **Which sync finished each night.** The app-open run (Monday), the alarm run (Tuesday), the charger unplug (Wednesday to Friday) and the card's Sync now button (Sunday). The alarm run worked on 1 of the 2 mornings that tested it cleanly; on the other, a stop from the lock screen left no trace at all. On Tuesday the status came about 1 hour 45 minutes after she woke, because nothing ran until the alarm.
- **The 11:30 reminder** fired on Friday, Saturday and Sunday, as designed. Friday and Sunday then synced before noon.
- **Check-ins** were answered on all 7 days the card was opened. No day rested on fewer than three readings.
- **The AI texts on real nights.** The six morning explanations held no false claim. One raised a wording question: on 4 November it said "nothing standing out" while Why today listed two small leans as the reasons. The weekly digest made on 9 November had two faults. It called Saturday an Ease off day whose question was left unanswered, although that status was never shown, because the digest reads the stored status rather than what was shown. It also called the night before Saturday morning "Saturday night". The digest was kept as it is (D117).

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

- **Sample size.** One person for two weeks. Week one had two days with a status shown; week two had six, all Ready. Neither week had a change day, so the action target was never tested. This can say whether the pipeline works; it cannot say whether the tool changes behaviour.
- **Blindness.** The same author built the system and counted the results, in both weeks. The counting rules were written first and the counts can be rerun, but nobody else checked them.
- **In-sample results.** The AI instruction and filter were tuned on the development cases. The filter was tightened after the held-out set was graded, so the held-out result is partly in-sample.
- **One shown status rested on a night without stages.** Of the two statuses shown in week one, the 20 October one (Ready) was built from a short night the Watch recorded without stages (D92); under score version 3 the same night is Ease off. The rule stays through week two (D104).
- **No outside user.** Nobody but the owner used it, so engagement and retention say nothing about other people.
- **Signal evidence is thin.** The owner's year has no calendar illness or major events, so the Signal check rests on one trip and on workouts far below her usual.
- **The Watch decides when the night arrives.** The Watch's sleep reached the iPhone's Health hours after waking on 30 October, and week one's log showed the same on 20 October. Clarivi cannot see that moment, so any sync target depends on something it does not control, and a fixed wait cannot fix it.
- **Card views from the iPhone app's background wakes.** From 10 November 2026, iOS also starts the iPhone app out of sight when the Watch saves sleep, and until task 10f each such start logged a card view nobody saw: on 10 November, three of the card views (two overnight, one a second after a background sync) were wakes like that, and two more in the afternoon can't be told apart. Week two ran before the app, so its results are not affected. After 10f, a card view, and a status recorded as shown, needs the app on screen. Engagement counts days, and 10 November also had a card view a few minutes after the morning notification, followed by Why today opened, so that day counts either way.
- **The week's one Ease off was never shown.** Saturday 7 November, the one day the score had something to say, was the day the phone was off. The status was worked out on Sunday from the past days, so the quiet-by-default week count and the action target both rest on Ready days only.
- **The sync design changed after week two.** The iPhone app replaced the Shortcut on 10 November (D118), and a night that arrives after noon now gets a late status (D119). Week two's sync result describes the Shortcut, not the app. The sync target itself is unchanged, so later weeks stay comparable.
- **Not measured yet.** The iPhone app's mornings, against the same sync target. Isolation between two real people.

## 5. What the results changed

- Week one's sync miss, and a log showing that even automatic runs often stopped before the night was complete, led to a third trigger that runs when the alarm is stopped, with a 10-minute wait (D94).
- A Ready status on a very short night, seen in the self-test on 3 October and again in week one, led to the sleep floor in score version 3 (D96). It made the quiet-by-default target miss on her year, which is reported as a miss.
- Counting the sync three ways showed that "4 of 7" counted any post and only 2 of 7 days had a status before noon, which led to D99 for week two.
- The held-out set's one slip, a digest describing a day-to-day change the data did not show, led to a second model checking every claim in each digest before it is shown (D95).
- The module check led to dropping all three modules (D94, 29 October).
- The alarm trigger's first real morning, which started but did not sync because the 10-minute wait ended at a locked phone and the night had not reached Health, led to dropping the wait and to a reminder that also covers a night that is still unfinished (D103). The earlier reminder was silenced by a partial post, as on 22 and 30 October.
- Her account, that she would not keep using it as it was, points at the sync and the noon rule; the noon rule is reopened only if week two shows syncs still arriving after noon (D94).
- Week two met the sync target, but only with four different triggers between them, two mornings rescued by the 11:30 reminder and an alarm run that worked on 1 of 2 clean tries. Her week-two account says the same thing in her words: the sync still needed her, and the alarm route doesn't fit mornings without an alarm. That led to the iPhone app, which reads Health and syncs on its own (D115, decided 4 November during the week and built then), and to retiring the Shortcut when the app was installed (D118).
- With the app syncing on its own, noon only bit on a morning like Saturday, when the phone was off. Together with her week-one account, that led to a late status after noon, with no nudge and no 8pm question, instead of no status at all (D119). The sync target still counts a status shown before noon.
- The digest's two faults were kept as they are (D117), and are reported here instead.

## 6. Next

- Count the iPhone app's mornings against the same sync target, and how long after waking each status arrives.
- A morning with Ease off or Rest shown, so the action target can be tested at all.
- A second real user, for isolation, engagement and Signal on a body other than the owner's.
- Workouts in the daily sync and a second year of data, before testing the modules again.
