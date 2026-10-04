import { test } from '@playwright/test'
import { notCounted, sampleDay } from '../src/lib/sample-days'
import { dailySync, openApp, TZ } from './fixtures/mock-app'

// Screenshots of every card state on made-up data, for review against the
// design. Skipped unless asked for: SCREENS=1 npx playwright test e2e/screens.spec.ts
// They land in test-results/screens/ (never committed).
test.skip(!process.env.SCREENS, 'screenshots only on request')
test.use({ timezoneId: TZ, serviceWorkers: 'block', viewport: { width: 390, height: 763 } })

const MORNING = '2026-09-29T06:50:00-05:00'
const TODAY = '2026-09-29'
const row = { ...sampleDay, date: TODAY, no_status_reason: null, settings_version: 2 }
const none = (reason: string) => ({ ...row, status: 'none', no_status_reason: reason, nudge: null, total: null, readings_used: 0, points: {} })
const synced = [dailySync('2026-09-29T06:42:00-05:00')]
const answered = { checkins: [{ answer: 'okay' }] }
const dates = Array.from({ length: 28 }, (_, k) => new Date(Date.UTC(2026, 8, 2 + k, 12)).toISOString().slice(0, 10))
const why = {
  nights: dates.map((night_date, k) =>
    k === 27
      ? { night_date, asleep_min: 352, hrv_median: 38, sleeping_hr: 51 }
      : { night_date, asleep_min: 430 + ((k * 13) % 50) - 25, hrv_median: 52 + ((k * 7) % 12) - 6, sleeping_hr: 50 + ((k * 3) % 5) - 2 },
  ),
  baselines: [
    ['hrv', 52, 6],
    ['sleep', 430, 34],
    ['sleeping_hr', 50, 2.5],
  ].map(([metric, m, s]) => ({ night_date: TODAY, metric, median_28: m, range_low: (m as number) - 2 * (s as number), range_high: (m as number) + 2 * (s as number), valid_nights: 42, building: false })),
  insights: [
    { date: TODAY, module: 'also_checked', metric: 'resp_rate', value: 14.8, severity: 'in_range' },
    { date: TODAY, module: 'also_checked', metric: 'resting_hr', value: 55, severity: 'in_range' },
    { date: TODAY, module: 'illness_check', metric: 'pattern', value: 0, severity: 'clear' },
  ],
  'rpc/status_zones': [
    {
      version: 2, ease_off_at: 1.2, rest_at: 2.4, window_nights: 42, min_valid_nights: 21, reading_order: ['hrv', 'sleeping_hr', 'sleep'],
      readings: { hrv: { window_nights: 42, min_valid_nights: 21 }, sleep: { window_nights: 42, min_valid_nights: 21 }, sleeping_hr: { window_nights: 42, min_valid_nights: 21 } },
    },
  ],
}

const shots: [string, string, Record<string, unknown[]>, string?][] = [
  ['01-check-in', MORNING, { daily_status: [row], uploads: synced }],
  ['02-card-sample-day', MORNING, { ...answered, daily_status: [row], uploads: synced, ...why }],
  ['05-card-waiting', MORNING, { ...answered, uploads: [dailySync('2026-09-28T06:51:00-05:00')] }],
  ['06-card-sleep-in-progress', MORNING, { ...answered, daily_status: [none('night_unfinished')], uploads: [dailySync('2026-09-29T06:42:00-05:00', { night_complete: false })] }],
  ['07-card-no-sync-yet-1140', '2026-09-29T11:40:00-05:00', answered],
  ['08-card-late-1150', '2026-09-29T11:50:00-05:00', { ...answered, daily_status: [row], uploads: [dailySync('2026-09-29T11:45:00-05:00')] }],
  ['09-card-no-sync-by-noon', '2026-09-29T12:10:00-05:00', answered],
  ['10-card-two-of-three', MORNING, { ...answered, uploads: synced, daily_status: [{ ...row, status: 'ready', nudge: 'train_as_planned', readings_used: 2, points: { ...sampleDay.points, hrv: notCounted('missing') } }] }],
  ['11-card-not-enough-data', MORNING, { ...answered, uploads: synced, daily_status: [none('not_enough_data')], nights: [{ night_date: TODAY, asleep_min: 300, hrv_median: null, sleeping_hr: null }] }],
  ['12-card-learning', MORNING, {
    ...answered, uploads: synced, daily_status: [none('learning')],
    baselines: [{ night_date: TODAY, metric: 'hrv', valid_nights: 14, building: true }, { night_date: TODAY, metric: 'sleep', valid_nights: 14, building: true }],
    nights: [{ night_date: TODAY, asleep_min: 370, hrv_median: 42, sleeping_hr: 55 }], 'rpc/status_zones': why['rpc/status_zones'],
  }],
  ['13-card-sync-rejected', MORNING, { ...answered, uploads: [{ received_at: '2026-09-29T11:40:00.000Z', kind: null, status: 'rejected', error: 'token_revoked', local_date: null, night_complete: false }, dailySync('2026-09-28T06:51:00-05:00')] }],
  ['14-card-importing', MORNING, { ...answered, 'uploads:months': ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05'].map((month_id) => ({ month_id, local_date: '2026-09-28' })) }],
]

for (const [name, at, tables] of shots) {
  test(name, async ({ page }) => {
    await openApp(page, { at, tables })
    await page.locator(name === '01-check-in' ? '.checkin' : '.list-row').waitFor()
    await page.screenshot({ path: `test-results/screens/${name}.png` })
  })
}

test('03-why-today and 04-why-today-numbers-open', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: { ...answered, daily_status: [row], uploads: synced, ...why }, path: '/#/why' })
  await page.locator('.decided').waitFor()
  await page.screenshot({ path: 'test-results/screens/03-why-today.png', fullPage: true })
  await page.locator('.reading-hrv .text-link').click()
  await page.locator('.decided .text-link').click()
  await page.screenshot({ path: 'test-results/screens/04-why-today-numbers-open.png', fullPage: true })
})

test('15-settings', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: answered, path: '/#/settings' })
  await page.locator('.nav-title').waitFor()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/screens/15-settings.png' })
})
