// Every sentence the app and its notifications show lives here, so the words
// are defined once and tested once (tech-spec section 4, "Wording").
// Plain TypeScript only: this file is used by both the web app and the
// server functions.

export const wording = {
  appName: 'Clarivi',

  signIn: {
    title: 'Sign in',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    working: 'Signing in…',
    // R2: one general message that doesn't say which part was wrong.
    wrongDetails: "That email and password don't match an account. Check them and try again.",
    forgot: 'Forgot your password? Contact Sabine.',
  },

  setPassword: {
    title: 'Set a new password',
    intro: 'Choose your own password to replace the temporary one. Use at least 12 characters.',
    newPassword: 'New password',
    confirm: 'Type it again',
    submit: 'Save password',
    working: 'Saving…',
    tooShort: 'Use at least 12 characters.',
    tooLong: 'Use 72 characters or fewer.',
    mismatch: "The two passwords don't match.",
    sameAsTemporary: 'Choose a password that is different from the temporary one.',
  },

  home: {
    signedInAs: 'Signed in as',
    owner: 'Owner',
    signOut: 'Sign out',
  },

  notifications: {
    title: 'Notifications',
    notInstalled: 'To get notifications, add Clarivi to your Home Screen, then open it from there.',
    notSupported: "This browser can't show Clarivi notifications. Use Clarivi from your iPhone's Home Screen.",
    blocked: 'Notifications are turned off for Clarivi. Turn them on in Settings, then Notifications, then Clarivi.',
    turnOn: 'Turn on notifications',
    turningOn: 'Turning on…',
    on: 'Notifications are on for this device.',
    devices: (n: number) => (n === 1 ? '1 device gets your notifications.' : `${n} devices get your notifications.`),
    sendTest: 'Send a test notification in 15 seconds',
    testScheduled: 'Sending in 15 seconds. You can lock your phone now.',
    failed: "That didn't work. Check your connection and try again.",
  },

  // Settings: the token the iPhone Shortcut uses to send readings (R10, R11).
  uploadToken: {
    title: 'Upload token',
    intro: 'The Clarivi Shortcut on your iPhone uses this token to send your Watch readings each morning.',
    none: "You don't have a token yet.",
    created: (when: string) => `Created ${when}.`,
    lastUsed: (when: string) => `Last used ${when}.`,
    notUsed: 'Not used yet.',
    create: 'Create token',
    reissue: 'Reissue token',
    reissueNote: 'Reissuing stops the old token working straight away, so you will need to paste the new one into the Shortcut.',
    passwordPrompt: 'Enter your password to continue.',
    password: 'Password',
    working: 'Creating…',
    cancel: 'Cancel',
    wrongPassword: "That password isn't right. Try again.",
    showOnce: "Copy this token now and paste it into the Clarivi Shortcut. It's shown only once.",
    copy: 'Copy token',
    copied: 'Copied',
    done: 'Done',
  },

  // Replies to the iPhone Shortcut, which can show them as a notification.
  // They carry no health detail.
  sync: {
    nightIn: "Last night's readings are in.",
    nightNotFinished: "Readings sent. Last night isn't finished yet, so the next sync will complete it.",
    alreadyIn: "Last night's readings are already in.",
    notYet: 'Not synced yet today.',
    monthIn: "This month's readings are in.",
    importProgress: (months: number) => `Your history: ${months} of 12 months imported.`,
    unknownToken: "Clarivi doesn't recognise this Shortcut's upload token. Create a token in Clarivi and paste it into the Shortcut.",
    tokenReplaced: 'This upload token has been replaced. Paste your new token from Clarivi into the Shortcut.',
    tooMany: 'Too many syncs in the last hour. Try again later.',
    notReadable: "Clarivi couldn't read this sync. Contact Sabine.",
    tooLarge: 'This sync is too large for Clarivi. Contact Sabine.',
    failed: "Clarivi couldn't save this sync. Try again later.",
  },

  // Words the Clarivi Sync Shortcut shows itself when run by hand.
  // scripts/shortcut/build_shortcut.py reads them from this file, so keep
  // each one a plain single-quoted string.
  shortcut: {
    menuPrompt: 'What would you like to do?',
    syncNow: 'Sync this morning',
    importHistory: 'Import my last 12 months',
    importFinished: 'Your history import is finished.',
  },

  // Push notification text. Only the morning notification carries the status
  // and its reason (R48); the test, reminder and follow-up carry no health
  // detail (R49, R50). Sent from Phase 4.
  push: {
    testTitle: 'Clarivi',
    testBody: 'Test notification. Tap to open Clarivi.',
    morningTitle: 'Clarivi',
    // "Ease off today: HRV well below your usual, sleep short" (R48).
    morning: (status: string, reasons: string) => `${status} today: ${reasons}`,
    readyReason: 'your readings are close to your normal',
    reasons: {
      hrv_outside_range: 'HRV well below your usual',
      hrv_worse_than_normal: 'HRV a little below your usual',
      sleep_outside_range: 'sleep short',
      sleep_worse_than_normal: 'sleep a little short',
      sleeping_hr_outside_range: 'heart rate up overnight',
      sleeping_hr_worse_than_normal: 'heart rate a little up overnight',
    },
    reasonJoin: ', ',
    reminderTitle: 'Clarivi',
    reminder: "No sync yet this morning. Run your readiness Shortcut before noon to get today's nudge.",
    followUpTitle: 'Clarivi',
    followUp: "Did you follow today's nudge?",
  },

  // The top of the readiness card (R20).
  day: {
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    // "Tuesday 29 September"
    date: (weekday: string, day: number, month: string) => `${weekday} ${day} ${month}`,
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    settings: 'Settings',
  },

  // The daily check-in (R16 to R19).
  checkin: {
    question: 'How do you feel today?',
    hint: 'Your answer never changes your status.',
    answers: { good: 'Good', okay: 'Okay', off: 'Off' },
    // The answer as it reads inside a sentence: "You said you feel okay today".
    answerInline: { good: 'good', okay: 'okay', off: 'off' },
    skip: 'Skip for now',
    saidBefore: 'You said you feel',
    saidAfter: 'today',
    change: 'Change',
    answer: 'Answer',
    cancel: 'Cancel',
    failed: "Your answer didn't save. Check your connection and try again.",
  },

  // The readiness card (R20 to R34).
  card: {
    status: { ready: 'Ready', ease_off: 'Ease off', rest: 'Rest' },
    // R35: the link and Why today's title follow the status.
    why: { ready: "Why you're ready today", ease_off: 'Why ease off today', rest: 'Why rest today' },
    synced: (time: string) => `Updated from your Watch at ${time}`,
    late: 'Late',
    lateNote: 'This sync came after 11:30am, later than usual.',
    partial: 'Based on 2 of 3 readings',
    nudgeLabel: "Today's nudge",
    nudges: {
      train_as_planned: { action: 'Train as planned', detail: 'Your body looks ready for whatever you had planned today.' },
      train_easy: { action: 'Train easy today', detail: 'Swap anything hard for something easy, like a walk or a gentle ride.' },
      rest: { action: 'Rest today', detail: 'Skip training and keep any movement gentle, like a short walk.' },
      prioritise_sleep: { action: 'Prioritise sleep tonight', detail: 'Keep today light and aim to be in bed earlier than usual.' },
    },
    loadFailed: "Couldn't load today's card. Check your connection and try again.",
    retry: 'Try again',
  },

  // Cards without a status (R25 to R32), and notices that sit on any card
  // (R11, R12). Each has a pill, a headline and one plain line.
  states: {
    waiting: {
      pill: 'Waiting',
      headline: "Waiting for this morning's sync",
      lastSync: (when: string) => `Your last sync was ${when}.`,
      neverSynced: 'Clarivi has no syncs from your iPhone yet.',
    },
    analysing: {
      pill: 'Waiting',
      headline: 'Your readings are in',
      detail: "Clarivi is working out today's status. This takes about a minute.",
    },
    nightUnfinished: {
      pill: 'Sleep in progress',
      headline: 'Your sleep is still in progress',
      detail: "Last night isn't finished in your Watch data yet. The card updates after your next sync.",
    },
    missed: {
      pill: 'No sync yet',
      headline: 'No sync yet this morning',
      detail: "Open the Shortcuts app and run Clarivi Sync before noon to get today's nudge.",
    },
    noSync: {
      pill: 'No sync',
      headline: 'No sync this morning',
      afterNoon: "Today's sync came after noon",
      detail: "There's no status or nudge today. Tomorrow starts afresh.",
    },
    notEnoughData: {
      pill: 'Not enough data',
      headline: 'Not enough data last night',
      noSleep: "Your Watch didn't record any sleep last night, so there's no status today.",
      tooFew: "Two or more of last night's readings are missing, so there's no status today.",
    },
    learning: {
      pill: 'Learning your normal',
      headline: 'Learning your normal',
      progress: (nights: number, needed: number) => `${nights} of ${needed} nights so far. Clarivi needs ${needed} nights to know your normal.`,
      // Last night's values in plain words, with no verdicts (R32).
      lastNight: (parts: string) => `Last night ${parts}.`,
      slept: (duration: string) => `you slept ${duration}`,
      hrv: (ms: string) => `your heart rate variability was ${ms} ms`,
      sleepingHr: (bpm: string) => `your heart rate while you slept was ${bpm} bpm`,
    },
    rejected: {
      headline: 'Sync is being rejected',
      token: "Your Shortcut's upload token no longer works. Create a new one in Settings and paste it into the Shortcut.",
      other: "Clarivi couldn't read your Shortcut's last sync. Contact Sabine.",
      settings: 'Open Settings',
    },
    // The history import (R12) uses sync.importProgress.
  },

  // Sentence parts for the card's briefing: a headline, then at most three
  // short sentences with no numbers (R21). briefing.ts puts them together.
  briefing: {
    headline: {
      ready: {
        allNormal: 'You look well recovered',
        small: 'Close to your normal',
        sleep: 'A short night, but your body has recovered',
        hrv: 'Heart rate variability was low, but the rest looks fine',
        sleeping_hr: 'Your heart rate was up overnight, but the rest looks fine',
      },
      ease_off: {
        sleepAndHrv: "A short night, and your body hasn't fully recovered",
        sleep: 'A short night, so take it a little easier',
        hrv: "Your body hasn't fully recovered",
        sleeping_hr: 'Your heart rate stayed up overnight',
        small: 'A few readings were a little off',
      },
      rest: 'Your body needs a rest today',
    },
    // What was worse than normal, outside the normal range.
    worse: {
      sleep: 'you slept much less than you normally do',
      hrv: 'your heart rate variability was lower than normal for you',
      sleeping_hr: 'your heart rate while you slept was higher than normal for you',
    },
    // Worse than normal, but still inside the normal range.
    slightlyWorse: {
      sleep: 'you slept a little less than usual',
      hrv: 'your heart rate variability was a little lower than usual',
      sleeping_hr: 'your heart rate while you slept was a little higher than usual',
    },
    // Better than normal, outside the normal range.
    better: {
      sleep: 'you slept more than you normally do',
      hrv: 'your heart rate variability was higher than normal for you',
      sleeping_hr: 'your heart rate while you slept was lower than normal for you',
    },
    // Readings that were normal: "Your heart rate while you slept was normal".
    names: { sleep: 'sleep', hrv: 'heart rate variability', sleeping_hr: 'heart rate while you slept' },
    normalOne: (a: string) => `your ${a} was normal`,
    normalTwo: (a: string, b: string) => `your ${a} and ${b} were both normal`,
    normalThree: (a: string, b: string, c: string) => `your ${a}, ${b} and ${c} were all normal for you`,
    missing: {
      sleep: "your Watch didn't record your sleep",
      hrv: "your Watch didn't record your heart rate variability",
      sleeping_hr: "your Watch didn't record your heart rate while you slept",
    },
    building: {
      sleep: 'your normal for sleep is still being learned',
      hrv: 'your normal for heart rate variability is still being learned',
      sleeping_hr: 'your normal for heart rate while you slept is still being learned',
    },
    // What it means.
    meaning: {
      readyAllNormal: 'Your body looks ready for whatever you have planned.',
      readySmall: "The differences are small, so there's no need to change your plans.",
      readyDespite: "On its own, that isn't enough to change your plans.",
      together: 'Together, those usually mean your body is still recovering.',
      hrv: 'That usually means your body is still recovering.',
      sleep: 'A short night can leave you less ready for a hard session.',
      sleeping_hr: 'That can mean your body is working harder than usual to recover.',
      small: 'Together, they add up to a day to take it a little easier.',
      rest: 'Together, those mean your body needs time to recover today.',
    },
    // The illness check (R33). "No early sign" only when the check ran.
    illnessClear: 'there was no early sign of illness or heavy strain',
    illnessFired: 'several of your overnight readings moved the wrong way together',
    // Joining clauses: "A, and B" and "A, B, and C".
    and: 'and',
  },

  // Why today (R35 to R43).
  why: {
    back: 'Today',
    dateLine: (date: string, time: string) => `${date} · updated from your Watch at ${time}`,
    // R36: how many readings were outside the normal range.
    counts: ['None', 'One', 'Two', 'Three'],
    countsLower: ['none', 'one', 'two', 'three'],
    summaryOff: (k: string, total: string, verb: string, dir: string) => `${k} of your ${total} recovery readings ${verb} ${dir} last night`,
    summaryAllIn: { 3: 'All three of your recovery readings were in your normal range last night', 2: 'Both readings Clarivi could use were in your normal range last night' },
    low: 'low',
    high: 'high',
    outside: 'outside your normal range',
    was: 'was',
    were: 'were',
    names: { hrv: 'heart rate variability', sleep: 'sleep', sleeping_hr: 'sleeping heart rate', resp_rate: 'breathing rate', resting_hr: 'resting heart rate' },
    // "was", "were both" or "were all", by how many readings are listed.
    verbFor: (count: number) => (count === 1 ? 'was' : count === 2 ? 'were both' : 'were all'),
    groupBelow: (list: string, verb: string) => `Your ${list} ${verb} below your normal range.`,
    groupAbove: (list: string, verb: string) => `Your ${list} ${verb} above your normal range.`,
    groupNormal: (list: string, verb: string) => `Your ${list} ${verb} normal for you.`,
    groupMissing: (name: string) => `Your Watch didn't record your ${name} last night.`,
    groupBuilding: (name: string) => `Your normal for ${name} is still being learned.`,
    lastNight: 'Last night',
    titles: { hrv: 'Heart Rate Variability', sleep: 'Sleep', sleeping_hr: 'Sleeping Heart Rate' },
    explainers: {
      hrv: 'The small changes in time between your heartbeats. Higher than your normal usually means you have recovered well. Measured in milliseconds (ms).',
      sleep: 'The time your Watch counted you as asleep, not just in bed.',
      sleeping_hr: 'Your heart rate while you were asleep last night. Higher than your normal can be a sign of tiredness or strain. Measured in beats per minute (bpm).',
    },
    units: { hrv: 'ms', sleeping_hr: 'bpm', hours: 'hr', minutes: 'min' },
    // "7h 10m"
    duration: (h: number, m: number) => (h === 0 ? `${m}m` : `${h}h ${m}m`),
    normalForYou: 'Normal for you',
    verdicts: {
      below: 'Below your normal range',
      above: 'Above your normal range',
      in_range: 'In your normal range',
      missing: 'No reading last night',
    },
    building: (nights: number, needed: number) => `Still learning your normal: ${nights} of ${needed} nights`,
    chart: { start: '4 weeks ago', band: 'Shaded: your normal range', end: 'Last night', label: (name: string) => `${name} over the last 4 weeks` },
    showNumbers: 'Show the numbers',
    hideNumbers: 'Hide the numbers',
    numbers: {
      range: 'Your normal range',
      vsNormal: 'Last night vs normal',
      fourWeeks: 'In the last 4 weeks',
      rangeValue: (low: string, high: string, unit: string) => `${low} to ${high}${unit ? ` ${unit}` : ''}`,
      lower: (diff: string) => `${diff} lower`,
      higher: (diff: string) => `${diff} higher`,
      less: (diff: string) => `${diff} less`,
      more: (diff: string) => `${diff} more`,
      same: 'The same as normal',
      lowest: 'Your lowest night',
      highest: 'Your highest night',
      lowerThan: (n: number, of: number) => `Lower than ${n} of ${of} nights`,
      higherThan: (n: number, of: number) => `Higher than ${n} of ${of} nights`,
      footnote: (window: number) =>
        `Normal is the middle of your last ${window} nights. The shaded range covers your usual ups and downs from night to night. A night outside it is flagged.`,
    },
    // R39: breathing rate, yesterday's resting heart rate and the illness check.
    alsoChecked: {
      title: 'Also checked',
      breathing: (v: string) => `your breathing rate while asleep (${v} breaths a minute)`,
      resting: (v: string) => `yesterday's resting heart rate (${v} bpm)`,
      bothNormalClear: (a: string, b: string) => `${a} and ${b} were both normal for you, so there is no early sign of illness or heavy strain.`,
      bothNormal: (a: string, b: string) => `${a} and ${b} were both normal for you.`,
      normal: (a: string) => `${a} was normal for you.`,
      higher: (a: string) => `${a} was higher than normal for you.`,
      lower: (a: string) => `${a} was lower than normal for you.`,
      missingBreathing: 'There was no breathing rate reading last night.',
      missingResting: 'There was no resting heart rate reading for yesterday.',
      buildingBreathing: 'Your normal breathing rate is still being learned.',
      buildingResting: 'Your normal resting heart rate is still being learned.',
      clear: "There's no early sign of illness or heavy strain.",
      fired: 'Several of your overnight readings moved the wrong way together, so take note of how you feel today.',
      notRun: "There weren't enough readings to check how they moved together.",
    },
    // R40: how the status is decided. The weights are never shown.
    decided: {
      title: "How today's status is decided",
      intro: 'Each reading adds points when it is worse than your normal. The further off it is, and the more that reading matters, the more points it adds.',
      order: (a: string, b: string, c: string) => `${a} matters most, then ${b}, then ${c}.`,
      adds: { ready: "Today's points add up to ready.", ease_off: "Today's points add up to ease off.", rest: "Today's points add up to rest." },
      reading: 'Reading',
      points: 'Points',
      notCounted: 'Not counted',
      total: "Today's total",
      zones: { ready: 'Ready', ease_off: 'Ease off', rest: 'Rest' },
      under: (n: string) => `under ${n}`,
      between: (a: string, b: string) => `${a} to ${b}`,
      orMore: (n: string) => `${n} or more`,
      today: 'Today',
      footnote: (window: number, recorded: number) =>
        recorded >= window
          ? `Your normal comes from your last ${window} nights, and all ${window} were recorded.`
          : `Your normal comes from your last ${window} nights, and ${recorded} of ${window} were recorded.`,
    },
  },

  // Times in the design's style: "today at 6:42am", "3 Oct at 6:42am".
  time: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    todayAt: (time: string) => `today at ${time}`,
    dayAt: (day: string, time: string) => `${day} at ${time}`,
  },

  general: {
    offline: "Couldn't reach Clarivi. Check your connection and try again.",
    notConfigured: "Clarivi isn't set up on this address yet.",
  },
} as const
