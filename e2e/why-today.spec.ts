import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { sampleDay } from '../src/lib/sample-days'
import { openApp, TZ } from './fixtures/mock-app'
import { normal, statusRow, synced, TODAY, whyTables } from './fixtures/sample-data'

// The service worker would take requests past the made-up answers.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const tables = {
  daily_status: [statusRow],
  uploads: synced,
  checkins: [{ answer: 'okay' }],
  ...whyTables,
}

test.describe('Why today on an iPhone', () => {
  test('opens from the card, titled with the status, and goes back (R35)', async ({ page }) => {
    const app = await openApp(page, { at: '2026-09-29T06:50:00-05:00', tables })
    await page.getByRole('link', { name: 'Why ease off today' }).click()
    await expect(page.getByRole('heading', { name: 'Why ease off today', level: 1 })).toBeVisible()
    await expect(page.getByText('Tuesday 29 September · updated from your Watch at 6:42am')).toBeVisible()
    await expect.poll(() => app.calls.find((c) => c.name === 'log_usage' && (c.body as { p_event: string }).p_event === 'why_today_open')?.body).toEqual({
      p_event: 'why_today_open',
      p_meta: { date: TODAY },
    })
    await page.getByRole('button', { name: wording.why.back }).click()
    await expect(page.getByRole('heading', { name: "A short night, and your body hasn't fully recovered" })).toBeVisible()
  })

  test('shows the summary and each reading against your normal (R36, R37)', async ({ page }) => {
    await openApp(page, { at: '2026-09-29T06:50:00-05:00', tables, path: '/#/why' })
    await expect(page.getByRole('heading', { name: 'Two of your three recovery readings were low last night' })).toBeVisible()
    const hrv = page.locator('.reading-hrv')
    await expect(hrv.locator('.big-value')).toHaveText('38ms')
    await expect(hrv).toContainText('Normal for you52 ms')
    await expect(hrv).toContainText(wording.why.verdicts.below)
    await expect(page.locator('.reading-sleep .big-value')).toHaveText('5hr52min')
    await expect(page.locator('.reading-sleeping-hr')).toContainText(wording.why.verdicts.in_range)
    await expect(page.getByRole('img', { name: 'heart rate variability over the last 4 weeks' })).toBeVisible()
  })

  test('opens and closes the numbers (R38)', async ({ page }) => {
    await openApp(page, { at: '2026-09-29T06:50:00-05:00', tables, path: '/#/why' })
    const hrv = page.locator('.reading-hrv')
    await hrv.getByRole('button', { name: wording.why.showNumbers }).click()
    await expect(hrv.locator('.numbers')).toContainText('Your usual range40 to 64 ms')
    await expect(hrv.locator('.numbers')).toContainText('Last night vs normal14 ms lower')
    await expect(hrv.locator('.numbers')).toContainText('In the last 4 weeksYour lowest night')
    await hrv.getByRole('button', { name: wording.why.hideNumbers }).click()
    await expect(hrv.locator('.numbers')).toHaveCount(0)
  })

  test('says what else was checked (R39)', async ({ page }) => {
    await openApp(page, { at: '2026-09-29T06:50:00-05:00', tables, path: '/#/why' })
    await expect(page.locator('.also')).toContainText(
      "Your breathing rate while asleep (14.8 breaths a minute) and yesterday's resting heart rate (55 bpm) were both in your usual range, so there is no early sign of illness or heavy strain.",
    )
  })

  test('explains the status with points and zones, never the weights (R40)', async ({ page }) => {
    await openApp(page, { at: '2026-09-29T06:50:00-05:00', tables, path: '/#/why' })
    const decided = page.locator('.decided')
    await expect(decided).toContainText('Heart rate variability matters most, then sleeping heart rate, then sleep.')
    await decided.getByRole('button', { name: wording.why.showNumbers }).click()
    await expect(decided.locator('.points')).toContainText("Today's total1.6")
    await expect(decided.locator('.zone')).toHaveText(['Readyunder 1.2', 'TodayEase off1.2 to 2.4', 'Rest2.4 or more'])
    await expect(decided).toContainText('Your normal comes from your last 42 nights, and all 42 were recorded.')
    for (const weight of ['40%', '35%', '25%', '0.4', '0.35', '0.25']) await expect(page.locator('main')).not.toContainText(weight)
  })

  test('names a missing reading and leaves its points uncounted (R41)', async ({ page }) => {
    const missing = {
      ...tables.daily_status[0],
      status: 'ready',
      nudge: 'train_as_planned',
      readings_used: 2,
      points: {
        ...sampleDay.points,
        hrv: { value: null, normal: 52, range_low: 40, range_high: 64, verdict: 'missing', spreads_worse: null, counted: false, points: null },
      },
    }
    await openApp(page, { at: '2026-09-29T06:50:00-05:00', tables: { ...tables, daily_status: [missing] }, path: '/#/why' })
    await expect(page.locator('.reading-hrv')).toContainText(wording.why.verdicts.missing)
    await page.locator('.decided').getByRole('button', { name: wording.why.showNumbers }).click()
    await expect(page.locator('.points')).toContainText(`Heart rate variability${wording.why.decided.notCounted}`)
  })

  test('shows a building normal without a range or verdict (R42)', async ({ page }) => {
    const building = {
      ...tables.daily_status[0],
      readings_used: 2,
      points: { ...sampleDay.points, hrv: { value: 38, normal: null, range_low: null, range_high: null, verdict: 'building', spreads_worse: null, counted: false, points: null } },
    }
    await openApp(page, {
      at: '2026-09-29T06:50:00-05:00',
      tables: { ...tables, daily_status: [building], baselines: [{ ...normal('hrv', 52, 6), building: true, valid_nights: 14, median_28: null, range_low: null, range_high: null }, normal('sleep', 430, 34), normal('sleeping_hr', 50, 2.5)] },
      path: '/#/why',
    })
    const hrv = page.locator('.reading-hrv')
    await expect(hrv).toContainText(wording.why.building(14, 21))
    await expect(hrv).not.toContainText(wording.why.normalForYou)
    await expect(hrv).not.toContainText(wording.why.chart.band)
  })

  test('fits the screen width and keeps tap targets at 44 points', async ({ page }) => {
    await openApp(page, { at: '2026-09-29T06:50:00-05:00', tables, path: '/#/why' })
    await expect(page.locator('.reading')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    for (const button of await page.getByRole('button', { name: wording.why.showNumbers }).all()) {
      expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  })
})
