# Product Spec: Clarivi (Apple Health Analytics Tool)

**Status:** Agreed, v1.0 (30 September 2026)
**Last updated:** 3 October 2026 (password minimum settled; shared-phone notifications decided; Phase 2: what counts as a night, points, nudge choice, illness check, Watch readings, owner's workouts and disrupted days, and the final score numbers settled; open questions 1 to 3 closed; Phase 3 planning: zone numbers, links before Phase 5, rejected-sync and import-progress states)
**Owner:** Sabine Joseph
**Sources:** mvp.md, apple_health_tool_project_brief v2, Clarivi Flow, Design screens

> Numbering note: requirement numbers (R1, R2, and so on) belong to this spec. They don't match the risk numbers in mvp.md.

---

## 1. Overview

**What it is.** A small iPhone web app that turns a person's own Apple Watch data into a plain-words morning answer: what last night's readings mean against their own normal, why today's status was set, and one action for today.

**The core value.** Apple Watch records the numbers; this tool explains them. Apple's own features don't explain how their results were reached.

**Who it is for.** Apple Watch users who train regularly, wear the watch overnight, and want to understand their numbers rather than read isolated daily values.

**v1 (the MVP).** Four people for a four-week test: Sabine (the owner) plus three testers. The test checks three things:
- **Feasibility:** data reaches the tool reliably every morning.
- **Signal:** the status flags days that were really off and stays quiet on normal days.
- **Value:** the nudge changes a decision at least some of the time.

---

## 2. Goals

1. Each morning, tell the user in plain words what last night's readings mean against their own normal.
2. Give one clear action for today, with its reason, before the user has to look at any chart.
3. Show exactly how today's status was decided, so the user can check it and learn to read their own signals.
4. Keep data flowing every morning without the user doing anything.
5. Record how each day felt and whether each nudge was followed, so the test can show whether the tool works.

---

## 3. Users

| User | Who | Signs in? | What they do |
|---|---|---|---|
| Tester | Three people, each wearing an Apple Watch overnight (first-generation Ultra or second-generation SE) with an iPhone | Yes, email and password, in an account the owner creates | Read the card, check in, act on the nudge, say whether they followed it |
| Owner | Sabine, who is also a user of the app (first-generation Ultra) | Yes, same as testers | Everything a tester does, plus create accounts, reset passwords, watch sync health, record events for her own year |

- There is no public sign-up. Nobody can create an account except the owner.
- The app sends no email at all.
- Testers never see each other's data or each other at all.
- A phone's notifications go to whoever signed in on it last, so a shared phone never shows another person's notifications (R9). Decided 3 October 2026.

---

## 4. User stories

### Setup and sync
- As a tester, I add the app to my iPhone home screen once, so it opens full screen like an app.
- As a tester, I sign in with the temporary password Sabine gave me and set my own password.
- As a tester, I install the Shortcut and add my upload token, so my data can reach the app.
- As a tester, I import my last year of history once, so the app knows my normal from day one.
- As a tester, I never have to sync by hand on a normal morning.
- As a tester, if a morning sync fails, I'm told how to run the Shortcut by hand before noon.

### Morning check-in
- As a tester, I record how I feel (good, okay or off) before I see the app's verdict, so my answer is honest.
- As a tester, I can skip the check-in and answer later in the day.

### Readiness card
- As a tester, I see today's status, a short plain-words briefing and one action when I open the app.
- As a tester, I can tell when the data was last synced, so I know today's card is current.
- As a tester, I'm told plainly when there isn't enough data for a status, instead of being shown a guess.

### Why today
- As a tester, I can see each reading against my normal range, so I understand why today got its status.
- As a tester, I can open the exact numbers if I want them, without them cluttering the screen.
- As a tester, I can see how the readings add up to today's status.

### Trends
- As a tester, I can see each reading over the last few weeks with my normal range shaded, so I can check the card for myself.

### Notifications and follow-through
- As a tester, I get one morning notification with my status and the reason.
- As a tester, on days the nudge asked me to change something, I'm asked at 8pm whether I followed it.
- As a tester, I can change that answer until the next morning.

### Weekly digest
- As a tester, I can read a plain summary of my week: what moved, what was flagged and how many nudges I followed.

### Account and privacy
- As a tester, I can change my password, sign out everywhere, reissue my upload token and delete all my data.
- As a tester, I know what appears on my lock screen and how to hide it.

### Owner
- As the owner, I create each tester's account and reset forgotten passwords, so no email is needed.
- As the owner, I can see each user's last successful sync and any failing notifications, so I spot a broken setup the same day.
- As the owner, I can record illness and major events for my own year, so the Signal check has evidence to compare against.
- As the owner, I can set the score settings before the test and keep them frozen during it.

---

## 5. Functional requirements

### Accounts and access
- **R1** There is no sign-up page. Only accounts the owner creates can sign in.
- **R2** A user signs in with email and password inside the home-screen app. A wrong email or password shows one general error message that doesn't say which was wrong.
- **R3** On first sign-in with a temporary password, the user must set a new password before seeing any data. Default: a minimum of 12 characters.
- **R4** A signed-in user can change their password from Settings by entering the current one.
- **R5** The sign-in screen says "Forgot your password? Contact Sabine." There is no reset email. The owner can set a new temporary password, and R3 then applies again.
- **R6** Sessions stay signed in from day to day, so tapping a notification never lands on a sign-in screen. Default: a session ends after 30 days without use.
- **R7** Settings has "Sign out everywhere", which ends the user's sessions on every device.
- **R8** Reissuing the upload token or deleting data asks for the password again first.
- **R9** A user only ever sees their own data. Trying to reach another user's data shows nothing and is logged.

### Setup and sync
- **R10** Settings lets the user create an upload token. The token is shown once with a copy button, alongside a link to the Shortcut and the one-page setup guide.
- **R11** Reissuing the token stops the old one working at once. Uploads with an old or invalid token are rejected, and the card shows "Sync is being rejected" with a link to Settings.
- **R12** The one-time import of the last 12 months runs in monthly parts. The card shows progress (for example "Importing your history: 5 of 12 months"), an interrupted import continues from the last finished month, and importing never sends a notification.
- **R13** Each morning between 4am and noon, the data posts by itself when the phone is unplugged or when the tester opens their chosen app. Running it twice, or by hand, never duplicates data or sends a second morning notification.
- **R14** The card shows when the data was last synced, for example "Updated from your Watch at 6:42am".
- **R15** Only Apple Watch readings are used. Readings from the iPhone or other apps are ignored.

### Daily check-in
- **R16** On the first open of the day, before the status shows, the app asks "How do you feel today?" with three equal answers (good, okay, off) and a Skip option.
- **R17** If skipped, the card appears at once and keeps a small prompt to answer later that day.
- **R18** An answer can be changed until the next morning's check-in. The first answer, its time and whether the status had already been seen are all kept.
- **R19** The check-in never changes the status.

### Readiness card (home screen)
- **R20** The card shows, in this order:
  - the date and a greeting
  - the status (Ready, Ease off or Rest) and when it was synced
  - a headline and a short briefing
  - today's nudge
  - a link titled with the status, for example "Why ease off today"
  - the check-in answer, with Change
  - a link to the weekly digest
- **R21** The briefing is in plain words, with no numbers, and at most three short sentences.
- **R22** The nudge is one of four actions: train as planned, train easy, rest, or prioritise sleep. It comes with one line on what that means today.
- **R23** In the morning, the whole card fits on one screen without scrolling on iPhones 390 points wide or larger, leaving room for the status bar and home indicator.
- **R24** Ready, Ease off and Rest are set from the readings by the score. A day without enough data is never shown as Ready.
- **R25 Waiting.** Before this morning's sync arrives, the card says it's waiting for the sync and shows the last sync time. Yesterday's status is never shown as today's.
- **R26 Night not finished.** If the night isn't finished in the data, the card says sleep is still in progress, shows no status and sends no notification.
- **R27 Missed sync.** If nothing has synced by 11:30am, the card says so and explains how to run the Shortcut by hand before noon.
- **R28 Late.** A sync between 11:30am and noon produces the normal card, marked as late.
- **R29 No sync by noon.** The card says there is no status today. No nudge and no 8pm question follow.
- **R30 Partial.** If one reading is missing or still building its baseline, the status comes from the other two, and the card says "Based on 2 of 3 readings".
- **R31 Not enough data.** If two or more readings are missing, or no sleep was recorded, the card says "Not enough data last night", with no status and no notification.
- **R32 Learning your normal.** If two or more readings are still building a baseline (fewer than 21 valid nights out of the last 42; 28 until 3 October 2026), the card shows "Learning your normal" with progress (for example "14 of 21 nights"). It shows last night's values in plain words, with no verdicts, no status, no notification and no 8pm question.
- **R33 Illness check.** If several overnight readings move together, the card shows a short pattern note, never a diagnosis. The words "no early sign of illness or heavy strain" appear only when the illness check ran with its inputs.
- **R34** If notifications are off or failing, the card says so and explains how to turn them back on.

### Why today
- **R35** The Why today screen opens from the card link. It is titled with the status ("Why ease off today", "Why rest today" or "Why you're ready today"), and its back button returns to the card.
- **R36** A summary at the top says how many readings are outside the normal range, in plain words.
- **R37** There is one card for each of the three readings: heart rate variability, sleep, and sleeping heart rate. Each card shows:
  - what the reading measures and its unit, in one grey line
  - last night's value
  - "Normal for you"
  - a verdict: below, above, or in your normal range
  - a 4-week chart with the normal range shaded and last night marked
- **R38** "Show the numbers" on a card reveals its normal range, how far last night was from normal, and how it compares with the last 4 weeks (for example "Your lowest night"). Tapping again hides them.
- **R39** An "Also checked" card shows breathing rate and yesterday's resting heart rate, plus the result of the illness check.
- **R40** "How today's status is decided" explains in plain words that each reading adds points when it is worse than normal, and more for the readings that matter most. On tap, it shows each reading's points, today's total and the three zones (Ready under 1.2, Ease off 1.2 to 2.4, Rest 2.4 or more, set 3 October 2026), with today's zone highlighted. The weights themselves are never shown.
- **R41** If a reading is missing, its card says "No reading last night", its chart shows a gap, and its points show as not counted.
- **R42** If a reading's baseline is still building, its card shows the value and chart without the shaded range or a verdict, plus the number of nights collected.
- **R43** Each opening of Why today is logged.

### Trend view
- **R44** "See your trends" opens one chart per score reading. Each chart shows the normal range as a band and marks flagged nights. Default range: the last 8 weeks.
- **R45** Nights without data show as gaps, never as zero.
- **R46** While a baseline is still building, charts show the values without a band, plus the number of nights collected.

### Notifications
- **R47** After install, the app asks for notification permission once, from a tap. Settings shows whether notifications are on and when the last one was delivered.
- **R48** At most one morning notification per day. It carries the status and reason, for example "Ease off today: HRV well below your usual, sleep short", and tapping it opens the card. It isn't sent on days without a status.
- **R49** If nothing has synced by 11:30am, one reminder is sent: "No sync yet this morning. Run your readiness Shortcut before noon to get today's nudge." It contains no health detail.
- **R50** On days the nudge asked for a change, a notification at 8pm local time asks "Did you follow today's nudge?" and opens the card on the question. It contains no health detail, and isn't sent on train-as-planned days or days without a morning nudge.
- **R51** Every notification's delivery and tap is logged.

### Follow-through
- **R52** "Did you follow today's nudge?" appears only on change days, and only from 8pm. Before 8pm the card shows the nudge without the question.
- **R53** From 8pm the question sits at the top of the card, with Yes and No buttons of equal size and weight. The morning briefing folds to its headline, and "Show this morning's briefing" opens it.
- **R54** After answering, the card shows "Recorded: you followed it" or "Recorded: you didn't follow it", with Change. The answer can be changed until the next morning.
- **R55** If unanswered by the next morning, that morning's card asks about yesterday before showing today's status.
- **R56** Every answer is logged with its time and where it was given: the 8pm notification, the card after 8pm, or the next morning's card.

### Weekly digest
- **R57** Once a week, a digest page summarises the week: what moved against normal, what was flagged, how many days had data and how many nudges were followed. It is written from a fixed template and is reachable from the card.
- **R58** Before the first digest, the page says when it will appear. A week with missing days says how many days had data.

### Privacy and wording
- **R59** "Delete my data" removes all of that user's readings, results and answers after the password is re-entered, and confirms when it's done.
- **R60** No third-party analytics or tracking runs on any page that shows health data.
- **R61** No screen or notification names a medical condition or suggests a diagnosis.
- **R62** The setup guide explains that notifications show status and reason on the lock screen, and how to set previews to "When Unlocked".

### Owner
- **R63** The owner can create an account with a temporary password, and can reset any user's password to a new temporary one.
- **R64** The owner can see, for each user: last successful sync, days with an 11:30 reminder (flagged after two in a row), notification delivery failures in the last two days, and import progress. Default: an owner-only page in the app.
- **R65** The owner can record dated events (illness, major events) for her own year. No screen is required; a simple entry method is enough.
- **R66** For the owner's account only, workout summaries are loaded once from a Health app export (changed 3 October 2026: no longer through the import Shortcut), used only for the Signal check.
- **R67** The owner can change the score settings (weights, zone limits, baseline window) without a new release. The settings are frozen for the four-week test.

---

## 6. Layout and responsiveness

**iPhone (primary).**
- Installed to the home screen and opened full screen, like an app.
- Designed for iPhones 390 points wide and up. None of the testers uses a 13 mini or an SE.
- Content stays clear of the status bar (about 47 to 62 points) and the home indicator (34 points).
- The morning card fits one screen (R23). Why today, the trend view and the weekly digest scroll.
- Every tap target is at least 44 points.

**Laptop or desktop browser.**
- The app works in a normal browser too, but this is the adapted layout, not the main one.
- The same single column as on the iPhone, centred, at most 480 points wide, with no separate desktop design.
- Notifications are iPhone-only in v1.

---

## 7. Out of scope for v1

- Public sign-up, email of any kind, or sign in with Apple.
- A native iPhone app, an Apple Watch app, or Android.
- Manual Apple Health exports (the import is automatic).
- Wrist temperature.
- A model-written weekly digest (it uses a fixed template).
- The causal layer: guided self-experiments and natural experiments.
- Longer-history analysis: lagged relationships, personal sleep need, seasonality, changepoints.
- Workout analysis: strength sessions, heart rate recovery, intensity zones, fitness tests.
- Weight, mobility and gait, sedentary and adherence patterns, the nudge calibration loop.
- The full detailed dashboard (only the minimal trend view is in), and a screen for entering events.
- Comparing users with each other.

---

## 8. Future features and what v1 must do to leave room

| Future feature | What v1 must do now |
|---|---|
| Heart rate recovery, strength and intensity analysis | Keep every raw reading, not just daily totals, so widening the import later redoes nothing |
| New analysis modules | Every module writes its results in one shared shape, and the card, digest and nudge only read that shape |
| Causal layer (experiments) | Keep the event table and an experiment register from day one |
| Nudge calibration | Log each nudge, its reason, whether it was followed and the next day's outcome |
| Workout-level analysis | Store workout records when they're imported |
| More delivery channels (for example email) | Treat the card, digest and nudge as content that can be sent through any channel |
| Model-written digest | Keep "work out the week's facts" separate from "write the sentences" |
| A native HealthKit app instead of the Shortcut | Keep the import as a swappable source that produces the same data |
| More users | Tie every piece of data to its user, with isolation enforced in one place |
| Tunable or learned score weights | Store the weights, limits and windows as settings, not fixed values |

---

## 9. Success criteria

**Checks a person can make by using the app**
- After the morning routine, the notification arrives, and tapping it opens today's card already signed in.
- The card's status can be traced on Why today to each reading, its points and the zone it landed in.
- Running the Shortcut a second time changes nothing and sends no second notification.
- Signing in as a second tester shows none of the first tester's data.
- Before 8pm on a change day there is no follow-through question; from 8pm it appears at the top with equal Yes and No.
- On a night with a reading missing, the card says "Based on 2 of 3 readings"; with two missing, it says "Not enough data last night" and no notification arrives.
- The morning card fits one screen on each tester's iPhone.

**Test targets** (confirmed 29 September 2026; they must not change once results arrive)
- **Sync:** each user has a successful morning sync on at least 26 of 28 days.
- **Notifications:** delivered on at least 90% of synced days that have a status.
- **Isolation:** no user ever sees another's data. No tolerance.
- **Correctness:** the calculations match the reference check on the owner's year, and no unfinished night is ever scored.
- **Signal, owner's year:** at least 2 in 3 objectively disrupted days would have been called Ease off or Rest.
- **Quiet by default:** Ease off and Rest together on no more than about 1 day in 7.
- **Signal, testers:** check-ins and status agree more often than chance, on days that have a status.
- **Engagement:** each tester opens the card or taps the notification on at least 5 days a week.
- **Action:** on change days, nudges are marked followed about half the time or more.
- **Retention:** all three testers are still syncing and opening the card in week four.
- **Conversations:** a short end-of-test conversation with each tester.

---

## 10. Decisions and open questions

### Decisions (all 29 September 2026 unless noted)
| Topic | Decision |
|---|---|
| Users | The owner plus three testers |
| Sync | Automatic each morning by iPhone Shortcut, when the phone is unplugged or the chosen app opens; a one-time import of the last 12 months in monthly parts |
| Morning notification | Status and reason; tapping it opens the card |
| Score readings | Heart rate variability, sleep and sleeping heart rate. Apple's resting heart rate feeds only the illness check |
| Score method | Fixed weights against a personal normal from the last 42 nights, with at least 21 valid nights |
| Test | Four weeks, judged against the targets in section 9 |
| Weekly digest | Written from a template, shown in the app only |
| Card and Why today | The card shows status and drivers; Why today is one tap away |
| Platform | An installable iPhone web app, phone first |
| Sign-in | Email and password; the owner creates accounts and resets passwords; no email is sent |
| Follow-through | Asked only from 8pm, on change days |
| Check-in | Skippable, and changeable until the next morning |
| Missed sync | An 11:30am reminder; a sync before noon gives a late nudge |
| Missing reading | Its weight moves to the other two; with two or more missing, there is no status |
| Baseline still building | Counts as missing; with two or more building, the card shows "Learning your normal" and is never Ready |
| Card design | A written morning briefing |
| Why today design | Reading cards against your normal; plain words, with numbers on tap |
| Screen name | "Why today", titled with the status |
| Screen fit | The morning card fits one screen on iPhones 390 points wide and up; the 8pm card folds the briefing |
| Core value | "Apple Watch records the numbers; this tool explains them" |
| Owner tasks (30 Sep 2026) | Kept as requirements under an Owner user (R63 to R67) |
| This spec (30 Sep 2026) | Stands alone, without MVP decision or risk numbers |
| Laptop layout (30 Sep 2026) | The same single column as the iPhone, centred, at most 480 points wide; no separate desktop design |
| Name (30 Sep 2026) | The product is called Clarivi (previously the working name Morning Readiness) |
| Password minimum (3 Oct 2026) | 12 characters (R3) |
| Shared phones (3 Oct 2026) | A phone's notifications go to whoever signed in on it last (R9) |
| What counts as a night (3 Oct 2026) | All the time asleep from 6pm to noon, dated by that morning; afternoon sleep is a nap; overlapping sleep records count once, with awake winning |
| Points (3 Oct 2026) | Each reading earns its weight times how far it was worse than normal, measured in spreads; nothing when normal or better (R40) |
| Nudge choice (3 Oct 2026) | Ready: train as planned. Rest: rest. Ease off: prioritise sleep when sleep earns the most points, otherwise train easy (R22) |
| Illness check (3 Oct 2026) | The pattern note shows when at least 3 of 4 overnight readings each move at least 1 spread the wrong way; it never changes the status or the nudge (R33) |
| Owner's workouts (3 Oct 2026) | Loaded once from a Health app export on the owner's Mac, not through the Shortcut (R66) |
| Disrupted days for the Signal check (3 Oct 2026) | Each day of illness; the morning after a travel day or a major event; the morning of a workout far below the owner's usual |
| Watch readings (3 Oct 2026) | A Watch is recognised as any source that records heart rate; other apps' and the iPhone's readings are ignored (R15). When two watches give a resting heart rate for the same day, the middle value is used |
| Score numbers (3 Oct 2026) | Weights 40/35/25; Ease off from 1.2, Rest from 2.4; normals from the last 42 nights with at least 21 valid; frozen for the test |
| A sync before the night arrives (3 Oct 2026) | If a morning sync comes before last night's sleep has arrived from the Watch, the card treats it as sleep still in progress (R26) until noon, and as not enough data after (R31) |
| What each person was shown (3 Oct 2026) | The status, nudge and reason shown each morning are kept as shown, and the test's results use them, even if a later recalculation corrects that day |
| Zone numbers on Why today (3 Oct 2026) | Shown from the settings version that scored the day (where Ease off and Rest start, and how many nights the normal comes from); the weights are never shown (R40) |
| Links before Phase 5 (3 Oct 2026) | Until the trend view, digest and Settings exist, the card's Settings button opens the temporary account screen, and the digest row (R20) and "See your trends" (R44) are left out, so no link leads nowhere |
| Rejected sync and import progress (3 Oct 2026) | Built with the other card states (R11, R12) |

### Open questions (each with a recommended default)
1. **Score numbers.** Settled 3 October 2026, from the owner's year, and frozen: heart rate variability 40%, sleeping heart rate 35%, sleep 25%; Ease off from 1.2 points and Rest from 2.4.
2. **Cap when a reading is missing.** Settled 3 October 2026: no cap (the owner's year has no days scored from 2 of 3 readings).
3. **Heart rate variability baseline.** Settled 3 October 2026: 21 valid nights out of the last 42, like the others (HRV is present on nearly every tracked night; the longer window is for gaps in tracking), and one HRV reading is enough for a night to count.
4. **Session length (R6).** Default: 30 days without use.
5. **Minimum password length (R3).** Settled 3 October 2026: 12 characters, set on the live project and checked by the app.
6. **Trend view range (R44).** Default: the last 8 weeks.
7. **Wording and layout of the less common states** (R25 to R34, R41, R42). Default: written during the build, within R21 and R61.
