# Clarivi: interview notes

*My product story, kept up to date as I build. Last updated 3 October 2026, at the end of Phase 1a.*

## Who it's for and why

I train regularly and I wear my Apple Watch every night, so I have years of heart rate, heart rate variability and sleep data. The watch is very good at recording numbers and very bad at telling me what they mean for today. I'd wake up to a heart rate variability number and have no idea whether it was bad for me or just a normal wobble.

So I built Clarivi for people like me: Apple Watch users who train, wear the watch overnight, and want to understand their numbers rather than read isolated daily values. Each morning it gives a plain-words answer: what last night's readings mean against your own normal, why today's status was set, and one action for today. The one-line pitch is "Apple Watch records the numbers; this tool explains them."

Version 1 is deliberately small: me plus three testers, for a four-week test.

## How I scoped it

I started by writing down the three things the MVP had to prove, because anything that didn't serve one of them was a candidate for cutting:

- **Feasibility:** can data get from the watch to the tool every morning without anyone doing anything?
- **Signal:** does the status flag the days that were really off, and stay quiet on normal days?
- **Value:** does the nudge actually change someone's decision some of the time?

I set the success targets before building anything, and froze them so I couldn't move the goalposts once results came in. For example: a successful morning sync on at least 26 of 28 days, and on my own backfilled year, at least 2 in 3 objectively disrupted days (travel, illness, very short workouts) should have been called "ease off" or "rest". With only four people, I'm honest that this shows direction, not proof, so I paired the numbers with an end-of-test conversation with each tester.

The hardest scoping call was cutting the causal layer (guided self-experiments). It was the part I found most interesting, but it needs far more history than a four-week test gives. I kept its data structures in the design so it can be built later without rework, and I'll present it as method rather than as a live result.

## Key decisions and tradeoffs

- **An installable web app, not a native iPhone app.** No App Store review and no developer membership, and since iOS 16.4 home-screen web apps can receive push notifications. The tradeoff is iOS quirks: notifications only work once the app is on the Home Screen, and the Home Screen app keeps its sign-in separate from Safari. I designed onboarding around that.
- **An iPhone Shortcut to move the data, not a HealthKit app or manual exports.** Nothing to install, and it runs automatically each morning. The risk is that iOS protects health data while the phone is locked, so I gave it two triggers: unplugging the phone in the morning, and a catch-up when the person opens an app they use every day. A native HealthKit app stays the upgrade path if Shortcuts proves unreliable.
- **An explainable score, not a black box.** Each reading is compared with the person's own last 28 nights, and the score is a simple weighted sum the user can trace on a "Why today" screen. I chose this over anything learned or opaque because trust is the whole product: if people can't see why the app said "ease off", they won't act on it. It also defaults to being quiet, so a warning means something.
- **Email and password with no email at all.** I create each tester's account and reset passwords myself. It's free and needs no email provider. The cost is that a tester who forgets their password has to message me, which is fine for four people.
- **Privacy as a requirement, not a feature.** I'm holding other people's health data, so one person seeing another's data is the worst thing the app could do. Every table is locked to its owner at the database level, and an automated check fails the build if any table isn't.
- **Status on the lock screen.** The morning notification says "Ease off today: HRV well below your usual, sleep short." That's the most useful message without opening the app, but it's also visible on the lock screen. I accepted that for usefulness, made it part of the consent form, and show testers how to hide previews.
- **Convenience versus a clean security rule.** Vercel's official Supabase integration saves setup time, but it copies secret values into Vercel. I accepted it with a guardrail: every build is checked so no secret can ever reach the browser, and the check fails a deploy if one does.
- **A shared phone follows whoever signed in last.** If two people use the same phone, its notifications go to the person signed in now, so nobody ever sees someone else's status on their lock screen.
- **Changing the data format after measuring, not guessing.** My plan said the iPhone Shortcut would send one entry per reading. On my own phone that took 14 and a half minutes for one day of heart rate. Sending each column as a list (all the times, then all the values) took 1.3 seconds. I changed the format, and the server lines the columns back up into the same readings, so nothing downstream changed.
- **Moving a rule to where it can actually run.** I only want heart rate from 6pm to noon, the night that matters. It turned out the iPhone's Health search only works in whole days, so the Shortcut now fetches yesterday and today, and the server keeps 6pm to noon on arrival. Same rule, different place, same storage.
- **One bad reading shouldn't cost a month.** During my year's import, a single resting heart rate reading that ran past 24 hours made the server refuse a whole month. I changed the rule: a reading that fails a check is set aside and counted, and the rest is stored. A malformed post as a whole is still refused. Strict where it protects the data, forgiving where it would just lose it.
- **Fixing a mistake while it was cheap.** My database project was created in the wrong region at first. It was still empty, so I recreated it in the right region the same day, before anything depended on it.

## Major bugs and how I fixed them

- **Switching off sign-ups switched off sign-in.** I wanted nobody to be able to create an account except me. The obvious setting turned off email sign-ups, but it also turned off email sign-in entirely, so nobody could log in. We caught it while testing on the local copy, before it reached the live project, used the general "no new sign-ups" switch instead, and recorded the trap so it wouldn't come back.
- **Setting a new password signed people out.** On first sign-in, testers must replace their temporary password. Saving the new password ended every existing session for security, which dropped people back at the sign-in screen. Now the app signs straight back in with the new password, so it feels seamless.
- **A security check that cried wolf.** The first version of the "no secrets in the build" check flagged the database library itself, because the library contains the text it uses to recognise secret keys. I rewrote the check to look for real keys and the exact secret values from the hosting settings, and proved it works by planting a fake secret and watching the build fail.
- **A sync that sent nothing.** My first real run from the phone reached the server and was accepted, but carried zero readings, even though my Health app was full of them. Rather than guess, I had Claude build a small "check" Shortcut that sends nothing and just shows on screen what the phone finds. Four quick rounds on my phone found two problems: iOS reads a plain date like "2026-10-03" as noon, not midnight, and the Health search ignores times of day altogether. Those findings drove the two decisions above.
- **Importing a year through an iPhone Shortcut.** The plan was simple: send a year of history, one month per post. My phone said no, five different ways, and I found each one with a tiny "check" Shortcut that showed on screen what was happening instead of guessing. iOS ignored date steps of whole months, so I step in hours. It stopped when one step handled about 4,000 heart rate readings, so heart rate is read a day at a time. It timed out posts bigger than about 400 KB, so each month goes in small parts. And it failed any post made straight after a loop, so the last part is sent inside it. The result: a year of my data (about 126,000 readings) in about 15 minutes, and if it ever stops, running it again carries on where it left off.
- **Previews that didn't know where the database was.** Vercel's integration only filled in settings for production, so preview builds of work in progress showed "isn't set up yet." I added the public values for previews by hand and documented them.

## Significant improvements

- **Proving the riskiest part first.** Before building any screens, I ran a spike on my own iPhone: install the app, sign in, receive a notification and tap it. A test notification arrived through Apple's push service about 15 seconds after I asked for it, and tapping it opened the app still signed in. The notification library worked first time, so I didn't need the fallback.
- **Guardrails that run on every change.** Every push to GitHub runs the app tests, the database tests, the secret check, and end-to-end tests that open the app in Safari's engine at iPhone size. I deliberately added an unprotected table on a scratch branch to prove the safety check really fails the build.
- **A plan I can keep current.** I keep five living documents (product spec, design, tech spec, progress and the MVP scope) and update them after each phase, so decisions and the reasons behind them never get lost. I also converted my original MVP PDF into an editable document so it could keep up with reality.
- **Checking the risk before building on it.** Heart rate variability carries the most weight in the morning score, and the plan flagged that it might be too sparse at night. Once my year was in, I counted: 239 of 240 tracked nights have at least one HRV reading during sleep, with a median of three. The risk was real on paper and absent in my data, and now I know rather than hope.
- **A Shortcut generated from code.** Building an iPhone Shortcut by hand means dozens of taps that are easy to get wrong. Instead the Shortcut is generated by a script, checked automatically on every push (every step wired up, valid data, no secrets inside), and signed on my Mac so it installs with one tap. The signed file stays private because Apple's signature includes my account email.
- **A code review at the end of every phase, and it paid off.** Phase 1's review found ten things. The two that mattered most: a gateway error could have been read as success and quietly marked a month of my import as done, and import progress could say "12 of 12" while a month was still half-sent. Both are fixed, and a new automatic check now runs the real upload path on every push. Two findings needed a call from me, and I made them: accept a small loss of heart rate from past trips for v1, and stop counting the tiny "already synced?" checks toward the hourly limit.
- **A code review at the end of every phase.** Each phase now closes with a review of everything it changed, with the findings fixed and the tests re-run before I call the phase done.
