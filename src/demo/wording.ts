// The demo build's own words (D95): the banner and the names of the mornings. They sit
// apart from the app's wording module only so the live app carries none of the demo
// (scripts/check-demo-bundle.mjs); src/wording.test.ts holds them to the same rules.
export const demoWording = {
  title: 'Demo with made-up data',
  region: 'Demo',
  morning: 'Morning ',
  choose: 'Choose a morning',
  note: 'Nothing here is real. The AI texts are fixed examples, and nothing leaves your browser.',
  scenarios: {
    'ease-off': 'Ease off (the sample day)',
    ready: 'Ready',
    'sleep-floor': 'Ease off because of a very short night',
    learning: 'Still learning your usual range',
    waiting: 'Waiting for last night to arrive',
    'no-sync': 'No sync by noon',
    evening: 'Evening question on an Ease off day',
  },
} as const
