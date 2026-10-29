# AI explanations: draft for Sabine's review

**Status:** draft, 29 October 2026 (D94, Phase 7b-4). Nothing here is built. When Sabine approves, the consent wording goes into `wording.consent` (version 3), the design into `tech-spec.md`, `product-spec.md` and `design.md`, and this file is kept as the record. The AI explains; it never sets the status (D94).

**Model:** Claude Opus 5.5 (`claude-opus-5-5`), chosen by Sabine on 29 October 2026, kept as a setting so it can change. About 0.7 cents for a morning's text and 27 cents a month at Anthropic's published prices (Opus 5.5: $4 per million words in, $20 out).

---

## 1. What the AI is allowed to see

The server builds the AI's input from the database's own results. Only the fields in the "Sent" column can reach it; nothing else is looked up.

| Sent each morning | Sent each week (the digest and the patterns) |
|---|---|
| The status word (Ready, Ease off, Rest) and the nudge name | Each of the last 7 days: weekday name, status, nudge, whether it was followed, the check-in answer (great, okay, off, or skipped) |
| For each of the three readings: its value in plain units, your usual (middle and range), and its points and zone | Each of the last 7 days: the three readings' values and points |
| The total points and the zone limits | The 8 weeks before, as weekly totals only: counts of each status, the average of each reading, check-in counts. Labelled "this week", "last week", "2 weeks ago" and so on |
| How many readings were used (3 of 3, 2 of 3), and whether the night was built without sleep stages | |
| Whether the illness check fired (a yes or no, never a conclusion) | |
| Whether the sync was late | |

**Never sent:** your name, email address, user id, upload token, device names, time zone, location, calendar dates (only weekday names and "this week" style labels), raw heart-rate samples, workouts, notes you typed, or anything from another person's account.

## 2. What the AI is asked to write, and where it shows

| Text | Where | Limits |
|---|---|---|
| **Morning explanation** | The briefing slot on the card, in place of the fixed briefing | At most 3 short sentences, no numbers (R21), 60 words |
| **Weekly digest** | The digest page (R-numbers to follow), in place of the fixed sentences | At most 6 sentences, numbers allowed only if they appear in the input |
| **Patterns over weeks** | A short list on the digest page | At most 3 items of 25 words each, each tied to something in the 8 weeks sent, and worded as "tends to", never as a cause |

Why today keeps its fixed wording. **No caption marks the AI's words (decided by Sabine, 29 October 2026).** The consent text and the "AI explanations" row in Settings are where a person learns the AI is used, and the saved record of each AI text (section 3, point 6) shows which words were AI-written. To revisit if other testers return, since a stricter regime may want the words marked.

## 3. Safety design

1. **The AI never decides the status.** The status comes from the score (D59, R24) and is passed to the AI as a fact. The AI's text must agree with it.
2. **The AI is told its rules** in a fixed instruction (versioned, stored in the repository): plain words; only the numbers it was sent; no medical advice; no condition or diagnosis; no "you should" beyond the nudge already chosen; no mention of anything not in the input.
3. **Every answer goes through a filter written as ordinary code, with tests, before anyone sees it.** It rejects an answer that:
   - names a condition or suggests a diagnosis (the same word list as the R61 check on the wording module, extended);
   - contains a number that was not in the input;
   - names a different status from the one set, or tells you to rest or train differently from the chosen nudge;
   - is too long, is not plain text, or is empty.
4. **If the filter rejects it, the AI gets one retry.** If that fails too, or the AI is slow (over 20 seconds), unavailable, or turned off, the card shows the existing fixed wording. A card is never blank because of the AI.
5. **Nothing the AI says is acted on.** It does not change data, send notifications, or run anything.
6. **A record of every text:** the text, the model, the instruction version, the date it is for, whether the filter passed. Not the input it was sent (the database already holds those values). Readable by you only. Deleted by "Delete my data" and "Withdraw consent".
7. **Everyone has agreed before anything is sent.** The AI box on the consent screen is required (Sabine, 29 October 2026): a person who has not agreed to consent version 3 cannot use the app, so nothing is ever sent for anyone who has not agreed. The fixed wording remains only as the fallback when the AI fails or is slow, never as a choice.
8. **The key** lives only in Supabase's secret store, as for the other secrets (never in the repository or Vercel). Spending is capped on Anthropic's side.
9. **Tests:** the filter with made-up good and bad answers (including a condition name, a wrong number, a wrong status, a long answer); the allow-list (a test fails if anything outside it reaches the AI's input, checked with a sentinel in each forbidden field); consent off sends nothing; the fallback on a timeout and on an error; deletion and withdrawal clear the records.

## 4. Consent version 3: the new words

The consent screen keeps its two required boxes and gets a third, also required (Sabine, 29 October 2026, changing the optional box first drafted). "I agree" works only when all three are ticked, or the person signs out. Note for the future: consent that is a condition of using the service is acceptable for a one-person test, but a stricter privacy regime (Quebec, Ontario) wants consent to each purpose to be separate and not a condition, so this is to revisit before other testers return.

**New section, after "What Clarivi collects":**

> **AI explanations**
> Clarivi can use an AI service, Claude, made by Anthropic, to write the plain-words explanation of your morning, your weekly digest and a few patterns across your weeks. Each time, Clarivi sends it only your results: your three readings, your usual range, your status, and for the digest a summary of your week and the weeks before. It never sends your name, your email address or calendar dates.
> The AI explains your results. It does not set your status, which comes from fixed arithmetic, and it gives no medical advice.
> To use Clarivi you need to agree to this. If you don't, you can sign out and nothing is sent.

**Addition to "Where it's kept"** (the region wording is Sabine's choice, 29 October 2026: Anthropic's processing location was not confirmed, so the text says "the United States or other countries where Anthropic operates"; to revisit if a tester under a stricter regime returns):

> If you agree to AI explanations, your results described above are also processed by Anthropic, which runs the AI service, in the United States or other countries where Anthropic operates. Anthropic does not use what it receives from Clarivi to train its models. It keeps it for up to 30 days, longer only if its safety systems flag a request or the law requires it (flagged requests can be kept for up to 2 years). Anthropic does not delete this on request, so "Delete my data" in Clarivi cannot remove it; it clears itself within that time.

**Change to "Who can see it":**

> You, in the app. Sabine, who runs the test, can reach the database to run it and to help you. If you agree to AI explanations, Anthropic's AI service sees the results described above. Nobody else. Your data is never sold, and Clarivi has no ads or tracking.

**The agreement box (required, unticked until the person ticks it):**

- [ ] I agree to Clarivi sending my results, as described above, to an AI service run by Anthropic to write explanations.

"I agree" works only once all three boxes are ticked. There is no Settings switch for the AI: turning it off would be withdrawing consent, which deletes everything (D80). Settings' "Your consent" card still shows the date agreed.

## 5. Two older lines to decide

The current consent still says "a small four-week test" and "Until 90 days after the test ends, then it's deleted". Since 8 and 9 October (D89, D91) the test is one week with Sabine alone, and D89 dropped the 90-day deletion of testers' data. Version 3 needs these made true. **Decided by Sabine, 29 October 2026:** "a small test run by Sabine Joseph" and "Kept until you delete it or Sabine ends Clarivi, then deleted within 30 days."

## 6. Your steps when we reach the key (7b-4's last step)

1. In Anthropic's Console (a different place from your Claude app, with its own billing), make an organization, add a small prepaid balance, and **set a monthly spending limit** (I suggest $5).
2. Make an API key named clarivi.
3. In the Mac's Terminal, run one command that asks for the key and saves it to Supabase's secrets. You type or paste it there once. It never comes to me and never goes in this chat.
4. I check that the secret exists (its name only, never its value).

## 7. Documents to update once this is approved

`docs/consent-draft.md` and `wording.consent` (version 3; the "Your data" page follows automatically); `docs/privacy-impact-assessment.md` and `docs/cayman-data-protection.md` (Anthropic as a further processor, and the deletion limit); `docs/product-spec.md` (new requirements); `docs/design.md` (the Settings row and the third box; no caption); `docs/tech-spec.md` (the function, the table, the secret, the filter).
