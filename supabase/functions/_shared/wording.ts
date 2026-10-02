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

  // Push notification text. Test and reminder texts carry no health detail.
  push: {
    testTitle: 'Clarivi',
    testBody: 'Test notification. Tap to open Clarivi.',
  },

  general: {
    offline: "Couldn't reach Clarivi. Check your connection and try again.",
    notConfigured: "Clarivi isn't set up on this address yet.",
  },
} as const
