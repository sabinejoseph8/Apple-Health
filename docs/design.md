# Design: Clarivi

**Status:** Agreed, v1.0 (30 September 2026)
**Last updated:** 9 October 2026 (the owner page's database line for the Pro plan, D90. 8 October: past days, D88, worded about that night and that day after the Phase 6 review; the no-sleep-stages card and the trends row on cards without a status, D87; 6 October: the on-screen words in this file brought in line with the wording review, D85: "Great" on the check-in, "your usual range" in verdicts, labels and footnotes; earlier, 5 October: what Phase 1a built from the Default form, icon and notification patterns; the final score numbers from Phase 2c: zones 1.2 and 2.4, normals from 42 nights; what Phase 3 built: the check-in, card states, notices and Why today details; what Phases 4 and 5 built: the 8pm card, Settings, trends, the digest and the owner page; what Phase 6 built: the app icon in deep violet, the setup guide, the consent screen, "Your data" and Settings' "Your consent" card; 5 October 2026: the Sync now button on the waiting cards)
**Designed screens:** the "Clarivi Screens" canvas (also in this project as `docs/design-screens.html`): the readiness card at 6:50am and 8pm, Why today, and Why today with the numbers open.
**Look:** native iOS, close to Apple Health. System font, light grey background, white rounded cards.

Anything marked **Default** wasn't designed yet. It's a proposed starting point that follows the same patterns.

---

## 1. Design principles

- **Answer first.** The status and today's action come before any chart.
- **Plain words, numbers on tap.** Sentences on the surface; exact numbers one tap away.
- **Your normal, not anyone else's.** Every reading is compared with the user's own normal (from their last 42 nights), never with population norms or other users.
- **Show the working.** Any status can be traced to its readings and points on Why today.
- **Quiet by default.** Normal readings look calm. Colour and emphasis go only to what is unusual.
- **One screen in the morning.** The morning card fits on one iPhone screen without scrolling.
- **Equal choices, honest answers.** Check-in and follow-through answers carry equal visual weight, so the design never nudges the answer.
- **Never a diagnosis.** Patterns are described as patterns. No condition is ever named.
- **Say when you don't know.** Missing or building data is stated plainly, never hidden or guessed.

---

## 2. Visual design language

### Colour palette

**Base**
| Name | Hex | Used for |
|---|---|---|
| Background | `#F2F2F7` | Page background behind all cards |
| Surface | `#FFFFFF` | Cards, rows, buttons on tinted areas |
| Text | `#000000` | Headlines, values, main text |
| Text secondary | `#3A3A3C` | Briefing paragraph, body copy, secondary icons |
| Text muted | `#6C6C70` | Captions, labels, "Usual for you", sync time |
| Separator | `#E5E5EA` | Row dividers, link-row top borders |
| Divider strong | `#D1D1D6` | Divider inside the points table |
| Chevron | `#C4C4C8` | Disclosure chevrons on rows and links |

**Action**
| Name | Hex | Used for |
|---|---|---|
| Link blue | `#0A60D8` | Links, text buttons ("Change", "Show the numbers"), icons in rows, the 8pm emphasis ring |
| Button blue | `#0A4FB8` | Text on answer buttons; the 8pm "Today's nudge" label |
| Button tint | `#EEF3FC` | Background of the Yes and No buttons on the 8pm card |

**Status**
| Name | Hex | Used for |
|---|---|---|
| Ease off text | `#8A4100` | Ease off pill text, "Today's nudge" label, "Below your usual range" verdicts |
| Ease off pill | `#FFEBD6` | Ease off pill background, today's zone box |
| Ease off tint | `#FFF4E8` | Nudge block background |
| Ease off line | `#F1D9BF` | Divider inside the nudge block |
| Ease off border | `#E6CBAE` | Button borders on the nudge tint |
| Attention orange | `#E07000` | Last-night dot on a chart when outside normal; today's zone outline |
| Normal green | `#1F7A35` | "In your usual range" verdict, "Recorded: you followed it" |
| Ready text / pill | `#1F7A35` / `#E3F4E8` | **Default:** Ready pill |
| Rest text / pill | `#A1261D` / `#FDE7E5` | **Default:** Rest pill |
| Neutral text / pill | `#3A3A3C` / `#E5E5EA` | **Default:** pills for Learning your usual levels, Waiting, No sync, Late |

**Readings** (one colour each, used for the reading's label, icon and chart)
| Reading | Line | Band (normal range) | Median line |
|---|---|---|---|
| Heart rate variability | `#0071A4` | `#E1F0F7` | `#7FB6D2` |
| Sleep | `#5856D6` | `#ECEBFB` | `#A9A8EC` |
| Sleeping heart rate | `#C4262F` | `#FBE7E8` | `#E79AA0` |

**Contrast rules**
- Text meets 4.5:1 on its background (3:1 for text 24 points and larger).
- Below and in-range verdicts differ in lightness and icon (down arrow vs. tick), not only in hue.

### Typography

System font throughout: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif`. Values use tabular numbers.

| Style | Size / weight / line height | Used for |
|---|---|---|
| Large title | 32 / 700 / 1.15, tracking -0.01em | Card greeting ("Good morning") |
| Big value | 34 / 700, tracking -0.02em | Reading values on Why today (unit: 17 / 400, muted) |
| Summary title | 24 / 700 / 1.2 | Top summary on Why today |
| Card headline | 22 / 700 / 1.25 | Briefing headline; "Train easy today" on the 8pm card |
| Section title | 20 / 700 | "Last night", "How today's status is decided"; nudge title |
| Emphasis | 17 / 600 | Nav bar title, values on the right of cards, answer buttons |
| Body | 15 / 400 / 1.45 to 1.5 | Briefing paragraph, summaries, rows, links |
| Question | 16 / 400 / 1.4 | "Did you follow it?" |
| Small | 14 / 400 | Numbers panels, "Recorded" lines |
| Caption | 13 / 400 / 1.4 | Grey explainer under each reading name, date line |
| Eyebrow | 12 to 13 / 600, uppercase, tracking 0.03 to 0.04em | "Tuesday 29 September", "Today's nudge" |
| Micro | 11 to 12 / 400 | Chart labels, footnotes, pill text sits at 13 / 600 |

### Spacing
- Base unit: 4 points. Common steps are 4, 6, 8, 10, 12, 14, 16 and 20.
- Page gutter: 16 points on each side.
- Safe areas: the top 47 points and bottom 34 points stay clear (63 and 42 points of padding on the card frames).
- Between cards: 16 points.
- Card padding: 20 points (briefing card), 18 by 20 (8pm card), 16 (Why today cards).
- Inside cards: 6 to 12 points between lines.
- Tap targets: at least 44 points high; answer buttons 48.

### Corner radius
| Element | Radius |
|---|---|
| Cards | 16 to 18 points |
| Nudge block | 14 |
| Numbers panels, Yes/No buttons, zone boxes | 10 to 12 |
| Pills | fully rounded |
| Settings button | circle (22 points radius on a 44 point button) |

### Shadows
- None. The layout is flat, like Apple Health.
- Emphasis uses a 2-point inner ring instead: Link blue for the 8pm question card, Attention orange for today's zone box.

### Motion (Default)
- Expanding and collapsing panels ("Show the numbers", "Show this morning's briefing"): 200ms ease-out height and fade.
- No animated counters or celebratory effects.
- With iOS Reduce Motion on, changes happen instantly.

---

## 3. Main UI components

**App header**
- Contains a date eyebrow, a large title greeting ("Good morning" or "Good evening") and a circular Settings button on the right.
- The Settings button has the label "Settings" for screen readers.

**Nav bar**
- Back button "Today" with a chevron, and a centred title ("Why ease off today").
- The title changes with the status.

**Status pill**
- States: Ready, Ease off, Rest. **Default:** neutral pills for Learning your usual levels, Waiting, No sync and Late.
- Always appears beside the sync time ("Updated from your Watch at 6:42am").

**Briefing card** (readiness card)
- Contains, in order: status pill, sync time, headline, briefing paragraph, nudge block, and a "Why ease off today" link row.
- **Morning:** everything shown.
- **8pm on a change day:** the paragraph folds away and "Show this morning's briefing" toggles it. The nudge block is hidden because the 8pm card repeats it.
- **Partial:** adds "Based on 2 of 3 readings".
- **No status** (not enough data, learning, waiting, no sync): neutral pill, one plain sentence, no nudge block.

**Nudge block**
- Ease off tint background with three lines:
  - eyebrow "Today's nudge"
  - the action ("Train easy today")
  - one line on what it means
- Never contains a question.

**Follow-through card** (8pm, change days only)
- Has a Link blue inner ring and contains:
  - bell icon with "Today's nudge"
  - the action
  - "Did you follow it?"
  - Yes and No buttons of equal size
  - the hint "You can change your answer until tomorrow morning"
- States: unanswered; "Recorded: you followed it" (green tick); "Recorded: you didn't follow it" (grey dash). Each recorded state has a Change button that returns to unanswered.

**Check-in row**
- **Answered:** a face icon, "You said you feel okay today" and Change.
- **Skipped:** "How do you feel today?" with a prompt to answer.

**Daily check-in screen (Default)**
- One question, "How do you feel today?", with three equal buttons (Great, Okay, Off; saved as good, okay and off) and a quiet Skip text button.
- Shown before the card on the first open of the day.

**List row**
- An icon, a label, optional muted detail on the right ("21 to 27 Sep") and a chevron. Used for the weekly digest link.

**Summary card** (Why today)
- Contains a status pill, "Train easy today", a headline ("Two of your three recovery readings were low last night") and one or two sentences.

**Reading card** (Why today)
- **Header:** reading name in its colour, an icon, and "Last night" on the right.
- **Explainer:** one grey line saying what it measures, which direction is good, and its unit.
- **Values:** the big value and unit; on the right, "Usual for you" and the usual value.
- **Verdicts:**
  - "Below your usual range" (Ease off text, down arrow)
  - "Above your usual range" (Ease off text, up arrow) **Default**
  - "In your usual range" (green tick)
  - "No reading last night" (muted) **Default**
- **Chart:** see "Mini chart" below.
- **"Show the numbers" / "Hide the numbers":** reveals a grey panel with Your usual range, Last night vs usual, and In the last 4 weeks.

**Mini chart**
- 4 weeks of nights at full card width, about 72 points tall.
  - The normal range is a light band in the reading's colour.
  - Normal itself is a dashed line.
  - Nights are a 1.8-point line.
  - Last night is a dot: Attention orange if outside the range, the reading's colour if inside.
- Labels underneath: "4 weeks ago", "Shaded: your usual range", "Last night".
- Missing nights are gaps. While the baseline is building, there is no band.

**Also checked card**
- One sentence on breathing rate, yesterday's resting heart rate and the illness check.

**Status decision section**
- A plain-words explanation, then "Show the numbers", which reveals:
  - a points table (reading and points, with a divider and "Today's total")
  - three zone boxes (Ready under 1.2, Ease off 1.2 to 2.4, Rest 2.4 or more), with today's box ringed and labelled "Today". The Clarivi Screens canvas shows the earlier placeholder numbers (1 and 2); the screens take the numbers from the active score settings (set 3 October 2026, D59).
- Footnote: "Your usual range comes from your last 42 nights, and all 42 were recorded." (or "40 of 42 were recorded" when some are missing). The canvas says "Your normal comes from your last 28 nights", the earlier words and window.

**Primary button**
- Full width, Link blue fill, white 17 / 600 text, 50 points high ("See your trends").

**Text button and link row**
- Link blue text.
- Link rows have a top separator and a chevron.

**Trend chart (Default)**
- A larger version of the mini chart, one per score reading, covering the last 8 weeks.
- Flagged nights are marked with an Attention orange dot. Tap a night to see its value and date.

**Forms (Default):** sign in, set new password, change password.
- Large inputs (at least 44 points) with visible labels, and one primary button.
- Errors appear in one line under the form.
- Password fields allow iCloud Keychain autofill and strong-password suggestions.
- As built in Phase 1a: the form sits in a white card titled with the Card headline style; input text is 16 points, because iOS zooms the page in on smaller text; inputs use the Background fill with a Separator border and a Link blue focus ring; the error line uses Rest text (`#A1261D`); "Forgot your password? Contact Sabine." sits centred and muted below the sign-in card.
- "Set a new password" carries one plain line ("Choose your own password to replace the temporary one. Use at least 12 characters."), a new password field and a "Type it again" field.

**Settings list (Default)**
- Grouped rows: Notifications (on or off, last delivered), Upload token (create or reissue), Setup guide, Change password, Sign out everywhere, Delete my data.
- Reissuing the token and deleting data ask for the password first. Delete uses red text and a confirmation step.

**Notification text** (system surface, not a screen)
- **Morning:** status and reason ("Ease off today: HRV well below your usual, sleep short").
- **11:30 reminder and 8pm question:** contain no health detail.
- **Test notification (Phase 1a):** title "Clarivi", body "Test notification. Tap to open Clarivi." No health detail.

**App icon (Default)**
- Was a placeholder until Phase 6: a white open ring, like a "C", on Link blue (`#0A60D8`). iOS rounds the corners itself.
- Drawn by `scripts/make-icons.py` at 180, 192 and 512 pixels. Replace it with a designed icon before testers install the app.
- **Chosen 4 October 2026 (D76):** the same open ring with a white dot in its opening, on deep violet (`#5B2A9E`; first built on Link blue, then changed by Sabine the same evening, chosen from indigo, royal purple, deep violet and Apple's purple), picked by Sabine from four drawn options (sunrise, three readings, a night inside the normal band, and this one). Built in Phase 6 (4 October 2026) by `scripts/make-icons.py`: the ring's middle at 28% of the width, 11% thick, open 40 degrees either side of level on the right, with rounded ends; the dot 13% across, centred at 79% from the left. Everything sits within 36% of the centre, inside the 40% safe zone of the maskable icon. A phone already showing the placeholder keeps it until the app is added to the home screen again.

---

## 4. Screens

| Screen | State shown | Where to see it |
|---|---|---|
| Readiness card | 6:50am, after the check-in, ease off day | Clarivi Screens canvas: "Readiness card · 6:50am" |
| Readiness card | 8pm follow-through, unanswered (Yes and No work in Play) | "Readiness card · 8pm follow-through" |
| Why today | Default, numbers closed | "Why today" |
| Why today | Numbers open for heart rate variability | "Why today · numbers open for heart rate variability" |

**Sample data on every designed screen:** Tuesday 29 September. Heart rate variability 38 ms (normal 52, range 40 to 64), sleep 5h 52m (normal 7h 10m), sleeping heart rate 51 bpm (normal 50). Check-in "okay". The points add up to 1.6, which is Ease off.

**Not designed yet; built from the components above:**
- Daily check-in screen
- Trend view
- Weekly digest
- Change password (sign in and "Set a new password" were built in Phase 1a from the Forms pattern)
- Settings: until Phase 5, the Settings button opens the Phase 1 account screen (account, notifications, upload token, Sign out) under a "< Today" nav bar (D63)
- Settings
- Owner status page (R64)
- Less common card states (waiting, night not finished, missed, late, no sync by noon, partial, not enough data, learning your normal, notifications off, sync rejected). These are left to the build, following the status pill and briefing card patterns. Built in Phase 3 (all but notifications off, which is Phase 4), as below.

**As built in Phase 3 (4 October 2026), on the Default patterns:**
- **Daily check-in screen:** the date and greeting header, then a white card: "How do you feel today?" (Card headline), three equal Button tint buttons (Great, Okay, Off; 48 points, 17/600 Button blue), the caption "Your answer never changes your status." and a quiet "Skip for now" text button. Opened again from the card, Skip becomes Cancel.
- **Check-in row:** a face icon in Link blue (wide smile for good, small smile for okay, flat mouth for off), "You said you feel **okay** today" and Change; after Skip, "How do you feel today?" and Answer. The weekly digest row is left out until Phase 5 (D63).
- **Greeting:** Good morning before noon, Good afternoon until 6pm, Good evening after.
- **Nudge block by status:** Ease off tint on Ease off days (as designed); Rest pill tint with Rest text eyebrow on Rest days; on Ready days the quiet Background grey with a muted eyebrow, so a normal day stays calm.
- **Late:** a neutral "Late" pill beside the status pill (the caption under the briefing was dropped in Phase 5 so the morning card still fits one screen with the digest row).
- **Cards without a status:** a neutral pill, a Card headline sentence and one or two plain lines (the last sync time, learning progress and last night's values); no nudge block and no Why link.
- **Notices:** "Sync is being rejected" is a white card above the briefing card with an Attention orange warning icon, a line on the fix and an "Open Settings" link row. Import progress is a caption under the briefing card.
- **Why today:** cards use 16 points of padding (so the summary headline stays on two lines); the "See your trends" button is left out until Phase 5 (D63); the zone boxes sit inside the numbers panel as white boxes, with today's box in the status's pill colour, an Attention orange inner ring and a "Today" tag.
- **Icons:** drawn in the app in the SF Symbols style (gear, chevrons, faces, warning, and per reading a pulse line, a moon and a heart).
- **As built in Phase 4 (4 October 2026):** the 8pm card as designed (Link blue ring, bell with "Today's nudge", the action, "Did you follow it?", Yes and No as equal Button tint buttons, the hint), above the briefing card folded to its pill, headline, "Show this morning's briefing" and the Why link; the recorded states show a green tick or a grey dash with Change. The next morning's question uses the same card with "Yesterday's nudge" and "You can answer until noon.", and a quiet "Not now" under it (Default, so the question never blocks the day). The notifications notice uses the notice pattern with a bell. Settings adds "Last notification delivered today at 6:44am".
- **As built in Phase 5, Settings (4 October 2026, live):** the nav bar "< Today", then white cards: Signed in as; Notifications (on or off, devices, "Last notification delivered …", Turn on, Send a test); Upload token; Account, a list of rows with chevrons (Change password, Sign out everywhere, and Delete my data in Rest text); then "Sign out of this phone" as a text button. Each Account row opens a card in place of the list: Change password (current, new, type it again, Save password); Sign out everywhere (a line on what it does, then the button); Delete my data (what it removes, that the account stays and it can't be undone, the password, and a red button, which is the confirmation step). Cancel returns to the list; a short line confirms what was done. The setup guide row arrives with the guide (Phase 6, D73).
- **As built in Phase 5, trends and digest (4 October 2026, live):** "See your trends" is a primary button at the foot of Why today. The trend view: nav bar "Your trends", "The last 8 weeks", then a card per reading (name and icon in its colour, a building note when needed, a 140-point chart, "8 weeks ago" and "Last night", and "Shaded: your usual range. Orange: outside it."). The band follows each night's normal (D70) and is left out where the normal was still being learned; tapping a night (or the arrow keys) shows "Tue 29 Sep: 38 ms" above the chart with a thin guide line. The card's list adds a "Weekly digest" row (calendar icon, the week as "21 Sep to 27 Sep" or "From 5 Oct" before the first, chevron). The digest page: the week as an eyebrow, "Your week" and the nights line, then cards "Your status", "Your readings" and "Your nudges". List rows are 52 points high.
- **As built in Phase 6, the setup guide (4 October 2026, D78):** a public page at `#/guide` that opens without signing in. The nav bar "< Back" and "Set up Clarivi", a short intro, then eight white cards, one per stage, each with a numbered headline (22-point bold) and a numbered list of steps in Text secondary (15 points, 10 points apart): before you start (sleep history, sleep tracking, other sleep apps, long trips), the Home Screen (with the page's own address), sign in (with consent), notifications (with When Unlocked, R62), the Shortcut (with a full-width primary "Get the Clarivi Shortcut" button), the import, the two automations, and each morning; then "Stuck on a step? Contact Sabine." as a footnote. The sign-in screen has a centred "How to set up Clarivi" text link under its footnote; Settings' Upload token card ends with two link rows, "Get the Clarivi Shortcut" (opens outside the app) and "Setup guide".
- **Wording review (6 October 2026, D85):** no screen says "normal". A reading is "in your usual range", "above" or "below your usual range"; the shaded band is "your usual range" in Why today, the charts, trends and the digest; the middle value is "Usual for you"; the learning state is "Learning your usual levels" (headline "Still learning your usual levels"); Ready headlines say "Your readings are all in your usual range" or "…but the rest looks as usual". The design canvas still shows the earlier words; the wording module wins. A wording test fails if "normal" returns.
- **Sync now (5 October 2026, D84):** on the waiting, sleep-in-progress and no-sync-yet cards (before noon), a full-width primary "Sync now" button under the card's text, then the caption "Opens the Shortcuts app to send last night's readings. Come back here when it's done." The card reloads when the person comes back. The no-sync-yet line now reads "Tap Sync now, or run Clarivi Sync in the Shortcuts app, before noon to get today's nudge." The morning card still fits 390 by 763 points with it.
- **As built in Phase 6, consent (4 October 2026, D79, D80):** the consent screen opens after the first sign-in and new password, before anything else: the large title "How Clarivi uses your data", then a white card per section (a 17-point semibold headline, then body text or a bulleted list in Text secondary), then "Your agreement" with two unticked checkboxes (22 points, Link blue when ticked, each with its statement beside it), the primary "I agree" (an inline "Tick both boxes to agree, or sign out." if one is missing) and "Sign out" as a text button; the version line as a footnote. The same sections, without the agreement, are the public "Your data" page (`#/privacy`, nav bar "< Back"), linked from the guide's sign-in step and from Settings. Settings has a "Your consent" card between Upload token and Account: "You agreed on 4 October 2026." as a caption, a "Read what you agreed to" row and a red "Withdraw consent" row, which opens the same password-and-red-button step as Delete my data.
- **As built in Phase 5, the owner page (4 October 2026, live):** Settings' "Signed in as" card adds an "Owner page" link row for the owner only. The page: nav bar "Owner", a Project card ("Database: 42.5 MB of 500 MB on the free plan.", with a bold Ease off text warning from 400 MB; since 9 October 2026, D90: "Database: 42.5 MB of 8 GB on the Pro plan.", with the warning "Nearly full: make a backup and look at the disk size in Supabase." from 80%, about 6.4 GB), then a card per person (name or email, a "You" pill on the owner's), with lines for the last sync, 11:30 reminders, failed notifications and history import; a problem (two reminders in a row, a failure) is in bold Ease off text. A tester who opens it sees "Only the owner can open this page."
- **No sleep stages (8 October 2026, D87):** the no-status card pattern with the neutral pill "No sleep stages", the Card headline "Your Watch didn't record sleep stages" and the line "Clarivi needs the sleep stages your Watch records to work out your status, so there's no status today."; before noon a second line, "If they show up later in the Health app, tap Sync now.", then the Sync now button and its caption. On every card without a status, the list under the card ends with a "See your trends" row (a small line-chart icon in Link blue, the label, a chevron), as there is no Why today to reach the trends from. The morning card still fits 390 by 763 points with both.
- **Past days (8 October 2026, D88):** Why today for that date: the nav bar "< Back" with the date as the title ("Monday 28 September"), no date line, the section title and each reading's caption "That night", the zone box without its "Today" tag, and "How the status was decided" with "That day's points added up to ready" (or ease off, or rest), words approved by Sabine; at the foot, after "See your trends", a row of text buttons, "< Previous day" on the left and "Next day >" on the right. Everything else on a past day speaks of that night and that day too (words approved by Sabine in the Phase 6 review): the summary ("...were low that night"), "No reading that night", "That night" under each chart, the sleeping heart rate note ("while you were asleep that night"), "That night vs usual", "That day's total", and in Also checked "the previous day's resting heart rate", "There was no breathing rate reading that night", "...for the previous day" and "...moved the wrong way together that night"; the nudge keeps the words that day had ("Train easy today"). A day without a status shows the card's neutral pill, then its reason said about that day: "Your Watch didn't record sleep stages" with "...so there was no status that day", "Clarivi was still learning your usual levels", or "Not enough data that night" with "Your Watch didn't record any sleep that night...", "Two or more of that night's readings were missing..." or "That night's sleep hadn't arrived by noon..." (a past night that never finished arriving reads as not enough data), then the readings that arrived; a day with nothing, one card: "Clarivi has no readings for this day." Today's Why today ends with a Button tint "Previous day" button under "See your trends". A card without a status ends its list with a "Previous days" row (a clock with an arrow turning back, in Link blue).
- **Page padding:** 16 points below the status bar and above the home indicator (the safe-area insets plus 16), matching the canvas's 63 and 42 point frames.

**Earlier options kept for reference only:**
- "Readiness Card Screen" canvas, option B (plan first)
- "The Working Screen" canvas, option A (contribution breakdown)
- Both still show Apple's resting heart rate and don't reflect later decisions.
