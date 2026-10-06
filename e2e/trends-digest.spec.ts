import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { openApp, TZ } from './fixtures/mock-app'
import { MORNING, statusRow, synced, TODAY, whyTables, zones } from './fixtures/sample-data'

// The service worker would take requests past the made-up answers.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const t = wording.trends
const d = wording.digest

// Eight weeks of made-up nights ending with the design's sample day. HRV's
// normal was still being learned for the first two weeks; two HRV nights in
// the middle are missing; last night (38) is below the range.
const dates = Array.from({ length: 56 }, (_, k) => new Date(Date.UTC(2026, 7, 5 + k, 12)).toISOString().slice(0, 10))
const nights = dates.map((night_date, k) => ({
  night_date,
  asleep_min: k === 55 ? 352 : 430 + ((k * 13) % 50) - 25,
  hrv_median: k === 55 ? 38 : k === 30 || k === 31 ? null : 52 + ((k * 7) % 12) - 6,
  sleeping_hr: k === 55 ? 51 : 50 + ((k * 3) % 5) - 2,
}))
const baselines = dates.flatMap((night_date, k) =>
  (
    [
      ['hrv', 52, 6],
      ['sleep', 430, 34],
      ['sleeping_hr', 50, 2.5],
    ] as const
  ).map(([metric, median, spread]) => {
    const building = metric === 'hrv' && k < 14
    return {
      night_date,
      metric,
      median_28: building ? null : median,
      range_low: building ? null : median - 2 * spread,
      range_high: building ? null : median + 2 * spread,
      building,
      valid_nights: building ? 7 + k : 42,
    }
  }),
)
const tables = {
  daily_status: [statusRow],
  uploads: synced,
  checkins: [{ answer: 'okay' }],
  ...whyTables,
  nights,
  baselines,
  'rpc/status_zones': [zones],
}

test.describe('the trend view (R44 to R46)', () => {
  test('opens from Why today with one chart per reading', async ({ page }) => {
    await openApp(page, { at: MORNING, tables, path: '/#/why' })
    await page.getByRole('button', { name: t.see }).click()
    await expect(page.getByRole('heading', { name: t.title, level: 1 })).toBeVisible()
    await expect(page.getByText(t.period)).toBeVisible()
    for (const name of ['heart rate variability', 'sleep', 'sleeping heart rate']) {
      await expect(page.getByRole('slider', { name: t.chartLabel(name) })).toBeVisible()
    }
  })

  test('logs each opening, with the day only', async ({ page }) => {
    const app = await openApp(page, { at: MORNING, tables, path: '/#/trends' })
    await expect.poll(() => app.calls.find((c) => c.name === 'log_usage')?.body).toEqual({ p_event: 'trends_open', p_meta: { date: TODAY } })
  })

  test("before last night's readings arrive, a known normal doesn't read as still learning", async ({ page }) => {
    const notYet = {
      ...tables,
      nights: nights.filter((n) => n.night_date !== TODAY),
      baselines: baselines.filter((b) => b.night_date !== TODAY),
    }
    await openApp(page, { at: MORNING, tables: notYet, path: '/#/trends' })
    await expect(page.locator('.reading-sleep .trend-plot')).toBeVisible()
    await expect(page.getByText('Still learning your normal', { exact: false })).toHaveCount(0)
  })

  test('marks nights outside that night\'s range, and shows a tapped night', async ({ page }) => {
    await openApp(page, { at: MORNING, tables, path: '/#/trends' })
    const hrv = page.locator('.reading-hrv')
    await expect(hrv.locator('.trend-dot.flagged').last()).toBeVisible()
    await expect(hrv.locator('.trend-readout')).toHaveText(t.hint)
    // Tap the right-hand edge: last night.
    const plot = hrv.locator('.trend-plot')
    const box = (await plot.boundingBox())!
    await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2)
    await expect(hrv.locator('.trend-readout')).toHaveText('Tue 29 Sep: 38 ms')
    // The arrow keys move night by night; a missing night says so (R45).
    await plot.focus()
    for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowLeft')
    await expect(hrv.locator('.trend-readout')).toHaveText('Sat 5 Sep: no reading')
  })

  test('draws the band only where the normal was known (D70, R46)', async ({ page }) => {
    await openApp(page, { at: MORNING, tables, path: '/#/trends' })
    // HRV's band starts after its first two weeks; the other two run all 8 weeks.
    await expect(page.locator('.reading-hrv polygon')).toHaveCount(1)
    await expect(page.locator('.reading-sleep polygon')).toHaveCount(1)
    const hrvBand = await page.locator('.reading-hrv polygon').getAttribute('points')
    const sleepBand = await page.locator('.reading-sleep polygon').getAttribute('points')
    expect(Number(hrvBand!.split(',')[0])).toBeGreaterThan(Number(sleepBand!.split(',')[0]))
  })

  test('says how many nights are collected while a normal is still being learned (R46)', async ({ page }) => {
    const learning = baselines.map((b) => (b.metric === 'hrv' && b.night_date === TODAY ? { ...b, building: true, valid_nights: 14, median_28: null, range_low: null, range_high: null } : b))
    await openApp(page, { at: MORNING, tables: { ...tables, baselines: learning }, path: '/#/trends' })
    await expect(page.locator('.reading-hrv')).toContainText(t.building(14, 21))
  })
})

test.describe('the weekly digest (R57, R58)', () => {
  test('before the first one, says when it will appear', async ({ page }) => {
    await openApp(page, { at: MORNING, tables })
    const row = page.getByRole('link', { name: new RegExp(d.row) })
    await expect(row).toContainText('From 5 Oct')
    await row.click()
    await expect(page.getByText(d.firstOn('Monday 5 October'))).toBeVisible()
  })

  test('logs each opening (tech-spec, usage log)', async ({ page }) => {
    const app = await openApp(page, { at: MORNING, tables, path: '/#/digest' })
    await expect.poll(() => app.calls.find((c) => c.name === 'log_usage')?.body).toEqual({ p_event: 'digest_open', p_meta: { date: TODAY } })
  })

  test('summarises last week from its facts', async ({ page }) => {
    const facts = {
      week_start: '2026-09-21',
      week_end: '2026-09-27',
      days_with_data: 6,
      statuses: { ready: 2, ease_off: 2, rest: 1, none: 2 },
      flagged: [
        { date: '2026-09-22', status: 'ease_off' },
        { date: '2026-09-24', status: 'rest' },
      ],
      readings: {
        hrv: { nights: 5, below: 2, above: 0, average: 44.8, normal: 52 },
        sleep: { nights: 5, below: 0, above: 0, average: 430, normal: 430 },
        sleeping_hr: { nights: 5, below: 0, above: 1, average: 51.6, normal: 50 },
      },
      pattern_nights: 0,
      nudges: { change_days: 3, followed: 2, not_followed: 0, unanswered: 1 },
    }
    await openApp(page, { at: MORNING, tables: { ...tables, digests: [{ week_start: '2026-09-21', facts }] } })
    await expect(page.getByRole('link', { name: new RegExp(d.row) })).toContainText('21 Sep to 27 Sep')
    await page.getByRole('link', { name: new RegExp(d.row) }).click()
    await expect(page.getByText('21 September to 27 September')).toBeVisible()
    await expect(page.getByText('Clarivi had readings from 6 of 7 nights, so this summary is based on those.')).toBeVisible()
    await expect(page.getByText('Ease off or Rest on Tuesday and Thursday.')).toBeVisible()
    await expect(page.getByText('Heart rate variability was below your usual range on 2 of 5 nights.')).toBeVisible()
    await expect(page.getByText("The nudge asked for a change on 3 days: you followed it on 2 and didn't answer on 1.")).toBeVisible()
  })
})

// The digest row must not push the morning card past one screen (R23).
test.describe('one screen in the morning, with the digest row', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('still fits', async ({ page }) => {
    await openApp(page, { at: MORNING, tables })
    await expect(page.locator('.digest-row')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0)
  })
})
