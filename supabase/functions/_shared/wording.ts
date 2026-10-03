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
    unknownToken: "Clarivi doesn't recognise this Shortcut's upload token. Create a token in Clarivi and paste it into the Shortcut.",
    tokenReplaced: 'This upload token has been replaced. Paste your new token from Clarivi into the Shortcut.',
    tooMany: 'Too many syncs in the last hour. Try again later.',
    notReadable: "Clarivi couldn't read this sync. Contact Sabine.",
    tooLarge: 'This sync is too large for Clarivi. Contact Sabine.',
    failed: "Clarivi couldn't save this sync. Try again later.",
  },

  // Push notification text. Test and reminder texts carry no health detail.
  push: {
    testTitle: 'Clarivi',
    testBody: 'Test notification. Tap to open Clarivi.',
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
