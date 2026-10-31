// The demo build's mornings (D95). Each one is a made-up day on the design's sample date,
// Tuesday 29 September, with the database's answers made up to match. The clock is the
// visitor's own, set to the scenario's wall-clock time, so a visitor anywhere sees the
// morning card, not the evening one. Every text the AI would write is a fixed example,
// written in the style of the real instruction and checked by the real filter in
// scenarios.test.ts. None of it is anyone's real data.
import { reading, sampleDay, sleepFloorDay, type SampleDay } from '../lib/sample-days'
import { type Tables } from './answer'
import { dailySync, TODAY, whyTables, zones } from './data'

export interface Scenario {
  id: string
  label: string
  // The wall-clock time on TODAY, in the visitor's own time zone.
  time: [hour: number, minute: number]
  // The screen the scenario opens on ('#/why'); the card by default.
  hash?: string
  tables: (now: Date) => Tables
}

export const DEFAULT_SCENARIO = 'ease-off'

const YESTERDAY = '2026-09-28'
const WEEK_START = '2026-09-21'

const readyDay: SampleDay = {
  status: 'ready',
  nudge: 'train_as_planned',
  total: 0,
  readings_used: 3,
  reason_codes: [],
  composite_fired: false,
  points: {
    hrv: reading('hrv', 54, 52, 6),
    sleep: reading('sleep', 440, 430, 34),
    sleeping_hr: reading('sleeping_hr', 50, 50, 2.5),
  },
}

// The fixed example texts (R70). The wording follows the AI's instruction: plain words, no
// digits, no condition, no advice, three short sentences at most.
export const EXAMPLE_MORNING = {
  ready: 'Your readings were all in your usual range last night. That fits the plan you already have for today.',
  ease_off:
    'Your heart rate variability and your sleep were both below your usual range, and your heart rate while you slept was a little higher. That points to a lighter day. Your breathing rate and resting heart rate were in your usual range.',
  sleep_floor:
    'Your sleep was far shorter than usual, and that alone makes today a lighter day. Your heart rate variability and your heart rate while you slept were in your usual range.',
} as const

export const EXAMPLE_DIGEST = {
  sentences:
    'You had a status on five of the seven days this week: two Ready days, two Ease off days and one Rest day. The other two days had no status. On the three days that asked you to change something, you followed the nudge on one, did not on one and did not answer on one. Your heart rate variability was below your usual range on two nights, while your sleep and your heart rate while you slept mostly stayed in your usual range. There are not enough weeks yet to see a pattern.',
  patterns: [] as string[],
}

const digestFacts = {
  week_start: WEEK_START,
  week_end: '2026-09-27',
  days_with_data: 6,
  statuses: { ready: 2, ease_off: 2, rest: 1, none: 2 },
  flagged: [
    { date: '2026-09-22', status: 'ease_off' },
    { date: '2026-09-23', status: 'ease_off' },
    { date: '2026-09-24', status: 'rest' },
  ],
  readings: {
    hrv: { nights: 5, below: 2, above: 0, average: 44.8, normal: 52 },
    sleep: { nights: 5, below: 0, above: 0, average: 430, normal: 430 },
    sleeping_hr: { nights: 5, below: 0, above: 1, average: 51.6, normal: 50 },
  },
  pattern_nights: 1,
  nudges: { change_days: 3, followed: 1, not_followed: 1, unanswered: 1 },
}

// Eight weeks of nights ending with last night, around the design's normals, with a short night
// and a high one in the middle and two nights with no heart rate variability.
const trendDates = Array.from({ length: 56 }, (_, k) => new Date(Date.UTC(2026, 7, 5 + k, 12)).toISOString().slice(0, 10))
function trendNights(last: { asleep_min: number; hrv_median: number | null; sleeping_hr: number }) {
  return trendDates.map((night_date, k) =>
    k === 55
      ? { night_date, ...last }
      : {
          night_date,
          asleep_min: 430 + ((k * 13) % 50) - 25 + (k === 40 ? -90 : 0),
          hrv_median: k === 30 || k === 31 ? null : 52 + ((k * 7) % 12) - 6 + (k === 20 ? 16 : 0),
          sleeping_hr: 50 + ((k * 3) % 5) - 2,
        },
  )
}
const trendBaselines = trendDates.flatMap((night_date, k) =>
  (
    [
      ['hrv', 52 + Math.sin(k / 9) * 2, 6],
      ['sleep', 430 + Math.sin(k / 7) * 8, 34],
      ['sleeping_hr', 50, 2.5],
    ] as const
  ).map(([metric, wobble, spread]) => {
    const building = metric === 'hrv' && k < 14
    // Today's normals are exactly the ones the status was worked out from.
    const median = k === 55 ? { hrv: 52, sleep: 430, sleeping_hr: 50 }[metric] : wobble
    return {
      night_date,
      metric,
      median_28: building ? null : median,
      range_low: building ? null : median - 2 * spread,
      range_high: building ? null : median + 2 * spread,
      building,
      valid_nights: building ? k : 42,
    }
  }),
)

const iso = (now: Date, minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString()
const synced = (now: Date, minutesAgo = 8) => [dailySync(iso(now, minutesAgo), { local_date: TODAY })]
const answered = { checkins: [{ date: TODAY, answer: 'okay' }] }
const none = (reason: string) => ({ date: TODAY, status: 'none', no_status_reason: reason, nudge: null, total: null, readings_used: 0, points: {}, settings_version: 3 })
const row = (day: SampleDay, now: Date, minutesAgo = 20) => ({ ...day, date: TODAY, no_status_reason: null, settings_version: 3, computed_at: iso(now, minutesAgo) })
const past = { ...readyDay, date: YESTERDAY, no_status_reason: null, settings_version: 3 }
const aiMorning = (day: SampleDay, explanation: string) => [{ kind: 'morning', for_date: TODAY, status: day.status, nudge: day.nudge, body: { explanation } }]

// What every scenario has behind it: the trends, the digest and Why today's numbers.
const common = (last: { asleep_min: number; hrv_median: number | null; sleeping_hr: number }): Tables => ({
  ...whyTables,
  nights: trendNights(last),
  baselines: trendBaselines,
  'rpc/status_zones': [{ ...zones, version: 3 }],
  digests: [{ week_start: WEEK_START, facts: digestFacts }],
  ai_texts: [{ kind: 'digest', for_date: WEEK_START, body: EXAMPLE_DIGEST }],
})

const sampleLast = { asleep_min: 352, hrv_median: 38, sleeping_hr: 51 }
const readyLast = { asleep_min: 440, hrv_median: 54, sleeping_hr: 50 }
const floorLast = { asleep_min: 372, hrv_median: 50, sleeping_hr: 50 }

export const SCENARIOS: Scenario[] = [
  {
    id: 'ease-off',
    label: 'Ease off (the sample day)',
    time: [6, 50],
    tables: (now) => {
      const base = common(sampleLast)
      return {
        ...base,
        daily_status: [row(sampleDay, now), past],
        uploads: synced(now),
        ai_texts: [...(base.ai_texts ?? []), ...aiMorning(sampleDay, EXAMPLE_MORNING.ease_off)],
      }
    },
  },
  {
    id: 'ready',
    label: 'Ready',
    time: [6, 50],
    tables: (now) => {
      const base = common(readyLast)
      return {
        ...base,
        daily_status: [row(readyDay, now), past],
        uploads: synced(now),
        ai_texts: [...(base.ai_texts ?? []), ...aiMorning(readyDay, EXAMPLE_MORNING.ready)],
      }
    },
  },
  {
    id: 'sleep-floor',
    label: 'Ease off because of a very short night',
    time: [6, 50],
    tables: (now) => {
      const base = common(floorLast)
      return {
        ...base,
        ...answered,
        daily_status: [row(sleepFloorDay, now), past],
        uploads: synced(now),
        ai_texts: [...(base.ai_texts ?? []), ...aiMorning(sleepFloorDay, EXAMPLE_MORNING.sleep_floor)],
      }
    },
  },
  {
    id: 'learning',
    label: 'Still learning your usual range',
    time: [6, 50],
    tables: (now) => ({
      ...common({ asleep_min: 370, hrv_median: 42, sleeping_hr: 55 }),
      ...answered,
      uploads: synced(now),
      daily_status: [none('learning')],
      baselines: [
        { night_date: TODAY, metric: 'hrv', valid_nights: 14, building: true },
        { night_date: TODAY, metric: 'sleep', valid_nights: 14, building: true },
      ],
    }),
  },
  {
    id: 'waiting',
    label: 'Waiting for last night to arrive',
    time: [6, 50],
    tables: (now) => ({
      ...common(sampleLast),
      ...answered,
      daily_status: [past],
      uploads: [dailySync(iso(now, 24 * 60 - 1), { local_date: YESTERDAY })],
    }),
  },
  {
    id: 'no-sync',
    label: 'No sync by noon',
    time: [12, 10],
    tables: (now) => ({
      ...common(sampleLast),
      ...answered,
      daily_status: [past],
      uploads: [dailySync(iso(now, 24 * 60 + 5), { local_date: YESTERDAY })],
    }),
  },
  {
    id: 'evening',
    label: 'Evening question on an Ease off day',
    time: [20, 0],
    tables: (now) => ({
      ...common(sampleLast),
      ...answered,
      daily_status: [row(sampleDay, now, 13 * 60 + 10), past],
      uploads: synced(now, 13 * 60 + 8),
      shown_status: [{ date: TODAY, nudge: sampleDay.nudge, shown_at: iso(now, 13 * 60) }],
    }),
  },
]

// The scenario's morning, as a date in the visitor's own time zone.
export function scenarioNow(s: Scenario): Date {
  const [y, m, d] = TODAY.split('-').map(Number)
  return new Date(y, m - 1, d, s.time[0], s.time[1])
}
