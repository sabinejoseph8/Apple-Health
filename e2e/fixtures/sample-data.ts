// Made-up data for the design's sample day (Tuesday 29 September), shared by
// the screen tests and the screenshots. None of it is anyone's real data.
import { sampleDay } from '../../src/lib/sample-days'
import { dailySync } from './mock-app'

export const TODAY = '2026-09-29'
export const MORNING = '2026-09-29T06:50:00-05:00'
export const statusRow = { ...sampleDay, date: TODAY, no_status_reason: null, settings_version: 2 }
export const synced = [dailySync('2026-09-29T06:42:00-05:00')]

// Four weeks of nights around the design's normals, ending with last night
// (HRV 38, sleep 5h 52m, sleeping heart rate 51).
const dates = Array.from({ length: 28 }, (_, k) => new Date(Date.UTC(2026, 8, 2 + k, 12)).toISOString().slice(0, 10))
export const nights = dates.map((night_date, k) =>
  k === 27
    ? { night_date, asleep_min: 352, hrv_median: 38, sleeping_hr: 51 }
    : { night_date, asleep_min: 430 + ((k * 13) % 50) - 25, hrv_median: 52 + ((k * 7) % 12) - 6, sleeping_hr: 50 + ((k * 3) % 5) - 2 },
)

export const normal = (metric: string, median: number, spread: number) => ({
  night_date: TODAY,
  metric,
  median_28: median,
  range_low: median - 2 * spread,
  range_high: median + 2 * spread,
  valid_nights: 42,
  building: false,
})

export const zones = {
  version: 2,
  ease_off_at: 1.2,
  rest_at: 2.4,
  window_nights: 42,
  min_valid_nights: 21,
  reading_order: ['hrv', 'sleeping_hr', 'sleep'],
  readings: {
    hrv: { window_nights: 42, min_valid_nights: 21 },
    sleep: { window_nights: 42, min_valid_nights: 21 },
    sleeping_hr: { window_nights: 42, min_valid_nights: 21 },
  },
}

// Everything Why today reads, for the sample day.
export const whyTables = {
  nights,
  baselines: [normal('hrv', 52, 6), normal('sleep', 430, 34), normal('sleeping_hr', 50, 2.5)],
  insights: [
    { date: TODAY, module: 'also_checked', metric: 'resp_rate', value: 14.8, severity: 'in_range' },
    { date: TODAY, module: 'also_checked', metric: 'resting_hr', value: 55, severity: 'in_range' },
    { date: TODAY, module: 'illness_check', metric: 'pattern', value: 0, severity: 'clear' },
  ],
  'rpc/status_zones': [zones],
}
