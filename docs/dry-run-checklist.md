# Dry run: checklist for setting up a tester

**Status:** prepared 5 October 2026 for Phase 6, step 3 (one tester, one week). The same steps onboard every tester in Phase 7. Nothing here holds anyone's details: those stay with Sabine, never in this public repository.

## 1. Before saying yes to a tester

From the tester's answers to Sabine's message:

| Check | Why | If not |
|---|---|---|
| iPhone model | The morning card must fit without scrolling. iPhones 390 points wide or more are tested; an SE or a mini (375 points) needs the fit checked first | Tell Claude the model: screen tests at that size, a fix if needed (about a day) |
| iOS 16.4 or later | Home Screen web apps get notifications only from iOS 16.4 | They update iOS first |
| An Apple Watch worn to bed | Each night is built from the Watch's sleep record | Not a fit for the test |
| At least three weeks of Watch sleep in Health (Browse, Sleep) | Clarivi needs 21 tracked nights before it gives a status | They'd be "Learning your normal" for most of the test |
| No other app writing sleep to Health (AutoSleep, Oura, Sleep Cycle) | Clarivi can't tell other apps' sleep from the Watch's | Tell Claude; their sleep may need checking |
| Long trips in the past year | Part of those nights' heart rate is lost in the import (D46) | Note the dates for Sabine, not here |
| Where they live (and province or state) | Which privacy rules apply; Quebec's are already met (`docs/cayman-data-protection.md`) | Somewhere new: Claude checks its rules first |
| They don't work for Sabine or depend on her | Their consent might not count (Schedule 5 of the Cayman Act) | Choose someone else |
| A free week, and a good time for the setup call | The setup takes about 30 minutes, best done together | Agree a date |

## 2. Make their account (Sabine, about 5 minutes)

1. **Supabase dashboard**, the Clarivi project: **Authentication**, **Users**, **Add user**, **Create new user**. Their email; any long throwaway password; tick **Auto Confirm User** (so no email is sent). Don't save the throwaway password.
2. **In the Mac's Terminal app,** in the Clarivi folder, give them a temporary password; this also makes the app ask them to choose their own at first sign-in:
   `.venv/bin/python scripts/reference/owner_data.py reset-password`
   Type their email, then a temporary password (at least 12 characters), twice.
3. **Check the owner page** (Settings, Owner page): they're listed, with no sync yet.

## 3. What to send them (privately)

- The setup guide: https://clarivi-zeta.vercel.app/#/guide (it opens without signing in and covers everything, including renaming the Shortcut to Clarivi Sync).
- Their email for signing in, and the temporary password in a separate message.
- That it's a one-week trial run, and what you'd like from them: use it each morning, and tell you anything confusing, broken or annoying, the moment it happens.

## 4. The setup call (about 30 minutes)

Go through the guide with them. Points that trip people up:
- Open Clarivi **from the Home Screen icon**, not Safari, before turning on notifications.
- **Allow Sharing Large Amounts of Data** (Settings, Apps, Shortcuts, Advanced) before the first sync.
- **Rename the Shortcut** to Clarivi Sync, so Sync now finds it.
- The **first run by hand** must allow Health and the iCloud Drive file, because the automations can't ask.
- The **import** takes about 15 minutes with the phone unlocked; if it stops, run it again.
- The **automations**: Run Immediately, a Text action with exactly `charger` or `app`, then Run Shortcut with that Text as input.
- **Notification previews: When Unlocked**, if they'd rather keep their status off the lock screen.
- **A locked run waits for a tap:** if the lock screen shows "Find Health Samples Where: Tap to run", unlock and tap Continue, or that run sends nothing (seen on Sabine's iPhone, 5 and 7 October 2026).
- **The first Sync now** asks "Allow Clarivi Sync to output 1 text item?": Always Allow (the item is only today's date; seen on Sabine's iPhone, 6 October 2026).

At the end, check together: the card shows (or "Learning your normal"), Settings says they agreed, "Send a test notification" arrives.

## 5. During the week

**Each morning (Sabine, 1 minute), on the owner page:**
- Their last sync is this morning.
- No reminder days in a row (flagged in orange after two).
- No failed notifications.
- The import shows 12 of 12 months after the first day.

**Ask Claude** whenever something looks off; Claude can check the server's logs for them without reading their readings.

**What the week should show** (Phase 6, manual check 2):
- A sync on at least 6 of 7 mornings.
- Notifications delivered.
- No card state anyone can't explain.
- Their feedback written down (in Sabine's own notes; Claude records the points without names or readings).

**Also measured** (Phase 1's tester-phone parts, D44, D45): how often their locked phone blocks the charger run (from the log, plus their own notes of the Shortcuts "device is locked" message, D75), whether their Watch's sleep stages arrive, and how long their import took.

## 6. At the end of the week

A short chat (10 minutes):
1. Did a morning ever feel wrong: no notification, a status that didn't match how you felt, a card you didn't understand?
2. How did the sync feel: automatic, Sync now, or a chore?
3. Was anything in the setup guide unclear?
4. Did the words ever sound medical or alarming?
5. Would you use it for four weeks as it is? What would you change first?

Then Claude fixes what broke, the phase's code review runs, and the settings are frozen after Sabine's self-test.

## Privacy reminders

- Never share or forward a tester's readings, status or answers, even in a screenshot.
- Their account details live only with Sabine, never in this repository.
- If anything about their data ever goes wrong, follow the breach steps in the tech spec (deployment, step 8): within 5 days.
