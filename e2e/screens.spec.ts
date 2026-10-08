import { test } from '@playwright/test'
import { notCounted, sampleDay } from '../src/lib/sample-days'
import { dailySync, openApp, TZ } from './fixtures/mock-app'
import { MORNING, statusRow, synced, TODAY, whyTables } from './fixtures/sample-data'

// Screenshots of every card state on made-up data, for review against the
// design. Skipped unless asked for: SCREENS=1 npx playwright test e2e/screens.spec.ts
// They land in screenshots/ (never committed).
test.skip(!process.env.SCREENS, 'screenshots only on request')
test.use({ timezoneId: TZ, serviceWorkers: 'block', viewport: { width: 390, height: 763 } })

const row = statusRow
const none = (reason: string) => ({ ...row, status: 'none', no_status_reason: reason, nudge: null, total: null, readings_used: 0, points: {} })
const answered = { checkins: [{ answer: 'okay' }] }
const why = whyTables

const shots: [string, string, Record<string, unknown[]>, string?][] = [
  ['01-check-in', MORNING, { daily_status: [row], uploads: synced }],
  ['02-card-sample-day', MORNING, { ...answered, daily_status: [row], uploads: synced, ...why }],
  ['05-card-waiting', MORNING, { ...answered, uploads: [dailySync('2026-09-28T06:51:00-05:00')] }],
  ['06-card-sleep-in-progress', MORNING, { ...answered, daily_status: [none('night_unfinished')], uploads: [dailySync('2026-09-29T06:42:00-05:00', { night_complete: false })] }],
  ['06b-card-no-sleep-stages', MORNING, { ...answered, daily_status: [none('no_sleep_stages')], uploads: [dailySync('2026-09-29T06:42:00-05:00', { night_complete: false })] }],
  ['06c-card-no-sleep-stages-afternoon', '2026-09-29T12:10:00-05:00', { ...answered, daily_status: [none('no_sleep_stages')], uploads: [dailySync('2026-09-29T06:42:00-05:00', { night_complete: false })] }],
  ['07-card-no-sync-yet-1140', '2026-09-29T11:40:00-05:00', answered],
  ['08-card-late-1150', '2026-09-29T11:50:00-05:00', { ...answered, daily_status: [row], uploads: [dailySync('2026-09-29T11:45:00-05:00')] }],
  ['09-card-no-sync-by-noon', '2026-09-29T12:10:00-05:00', answered],
  ['09b-card-status-delayed', '2026-09-29T07:10:00-05:00', { ...answered, uploads: synced }],
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
    await page.locator(name === '01-check-in' ? '.checkin' : '.checkin-row').waitFor()
    await page.screenshot({ path: `screenshots/${name}.png` })
  })
}

test('03-why-today and 04-why-today-numbers-open', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: { ...answered, daily_status: [row], uploads: synced, ...why }, path: '/#/why' })
  await page.locator('.decided').waitFor()
  await page.screenshot({ path: 'screenshots/03-why-today.png', fullPage: true })
  await page.locator('.reading-hrv .text-link').click()
  await page.locator('.decided .text-link').click()
  await page.screenshot({ path: 'screenshots/04-why-today-numbers-open.png', fullPage: true })
})

// Phase 4: the 8pm question on a change day, and yesterday's the next morning.
const shownEaseOff = [{ date: TODAY, nudge: 'train_easy', shown_at: '2026-09-29T11:44:00Z' }]
test('16-card-8pm-question and 17-card-8pm-answered', async ({ page }) => {
  await openApp(page, { at: '2026-09-29T20:00:00-05:00', tables: { ...answered, daily_status: [row], uploads: synced, shown_status: shownEaseOff } })
  await page.locator('.follow-through').waitFor()
  await page.screenshot({ path: 'screenshots/16-card-8pm-question.png' })
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await page.locator('.follow-recorded').waitFor()
  await page.screenshot({ path: 'screenshots/17-card-8pm-answered.png' })
})

test('18-next-morning-question', async ({ page }) => {
  await openApp(page, { at: '2026-09-30T07:00:00-05:00', tables: { shown_status: shownEaseOff } })
  await page.locator('.follow-through').waitFor()
  await page.screenshot({ path: 'screenshots/18-next-morning-question.png' })
})

test('19-card-notification-failed', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: { ...answered, daily_status: [row], uploads: synced, notifications: [{ kind: 'morning', status: 'failed' }] } })
  await page.locator('.checkin-row').waitFor()
  await page.screenshot({ path: 'screenshots/19-card-notification-failed.png', fullPage: true })
})

// Phase 5: trends (8 weeks of made-up nights) and the digest.
test('20-trends and 21-trends-night-picked', async ({ page }) => {
  const dates = Array.from({ length: 56 }, (_, k) => new Date(Date.UTC(2026, 7, 5 + k, 12)).toISOString().slice(0, 10))
  const nights = dates.map((night_date, k) => ({
    night_date,
    asleep_min: k === 55 ? 352 : 430 + ((k * 13) % 50) - 25 + (k === 40 ? -90 : 0),
    hrv_median: k === 55 ? 38 : k === 30 || k === 31 ? null : 52 + ((k * 7) % 12) - 6 + (k === 20 ? 16 : 0),
    sleeping_hr: k === 55 ? 51 : 50 + ((k * 3) % 5) - 2,
  }))
  const baselines = dates.flatMap((night_date, k) =>
    ([['hrv', 52 + Math.sin(k / 9) * 2, 6], ['sleep', 430 + Math.sin(k / 7) * 8, 34], ['sleeping_hr', 50, 2.5]] as const).map(([metric, median, spread]) => {
      const building = metric === 'hrv' && k < 14
      return { night_date, metric, median_28: building ? null : median, range_low: building ? null : median - 2 * spread, range_high: building ? null : median + 2 * spread, building, valid_nights: building ? 7 + k : 42 }
    }),
  )
  await openApp(page, { at: MORNING, tables: { nights, baselines, 'rpc/status_zones': why['rpc/status_zones'] }, path: '/#/trends' })
  await page.locator('.reading-sleeping-hr .trend-plot').waitFor()
  await page.screenshot({ path: 'screenshots/20-trends.png', fullPage: true })
  const plot = page.locator('.reading-hrv .trend-plot')
  const box = (await plot.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2)
  await page.screenshot({ path: 'screenshots/21-trends-night-picked.png' })
})

test('22-digest', async ({ page }) => {
  const facts = {
    week_start: '2026-09-21', week_end: '2026-09-27', days_with_data: 6,
    statuses: { ready: 2, ease_off: 2, rest: 1, none: 2 },
    flagged: [{ date: '2026-09-22', status: 'ease_off' }, { date: '2026-09-23', status: 'ease_off' }, { date: '2026-09-24', status: 'rest' }],
    readings: {
      hrv: { nights: 5, below: 2, above: 0, average: 44.8, normal: 52 },
      sleep: { nights: 5, below: 0, above: 0, average: 430, normal: 430 },
      sleeping_hr: { nights: 5, below: 0, above: 1, average: 51.6, normal: 50 },
    },
    pattern_nights: 1,
    nudges: { change_days: 3, followed: 1, not_followed: 1, unanswered: 1 },
  }
  await openApp(page, { at: MORNING, tables: { digests: [{ week_start: '2026-09-21', facts }] }, path: '/#/digest' })
  await page.getByText('Your week').waitFor()
  await page.screenshot({ path: 'screenshots/22-digest.png', fullPage: true })
})

test('15-settings', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: answered, path: '/#/settings' })
  await page.locator('.nav-title').waitFor()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'screenshots/15-settings.png', fullPage: true })
})

// Phase 6: consent (D79, D80) and the public "Your data" page.
test('30-consent', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: { daily_status: [row], uploads: synced, consents: [] } })
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.screenshot({ path: 'screenshots/30-consent.png', fullPage: true })
})

test('31-settings-consent', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: { ...answered, daily_status: [row], uploads: synced }, path: '/#/settings' })
  await page.getByRole('heading', { name: 'Your consent' }).waitFor()
  await page.screenshot({ path: 'screenshots/31-settings-consent.png', fullPage: true })
})
