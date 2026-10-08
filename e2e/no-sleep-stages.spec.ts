import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { dailySync, openApp, TZ } from './fixtures/mock-app'
import { MORNING, statusRow, synced } from './fixtures/sample-data'

// D87: when the Watch's sleep arrived without stages, the card says so (with
// Sync now until noon) instead of "sleep in progress", then "not enough data".
// Cards without a status also get a "See your trends" row (Sabine, 8 October 2026).
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const s = wording.states.noSleepStages
const answered = { checkins: [{ answer: 'okay' }] }
const tables = {
  ...answered,
  daily_status: [{ ...statusRow, status: 'none', no_status_reason: 'no_sleep_stages', nudge: null, total: null, readings_used: 0, points: {} }],
  uploads: [dailySync('2026-09-29T06:42:00-05:00', { night_complete: false })],
}
const URL_ = 'shortcuts://run-shortcut?name=Clarivi%20Sync&input=text&text=button'

test('says the Watch recorded no sleep stages, with Sync now before noon', async ({ page }) => {
  await openApp(page, { at: MORNING, tables })
  await expect(page.getByText(s.pill)).toBeVisible()
  await expect(page.getByRole('heading', { name: s.headline })).toBeVisible()
  await expect(page.getByText(s.detail)).toBeVisible()
  await expect(page.getByText(s.laterHint)).toBeVisible()
  await expect(page.getByRole('link', { name: wording.card.syncNow })).toHaveAttribute('href', URL_)
})

test('after noon it says the same, without Sync now', async ({ page }) => {
  await openApp(page, { at: '2026-09-29T12:10:00-05:00', tables })
  await expect(page.getByRole('heading', { name: s.headline })).toBeVisible()
  await expect(page.getByText(s.detail)).toBeVisible()
  await expect(page.getByText(s.laterHint)).toHaveCount(0)
  await expect(page.getByRole('link', { name: wording.card.syncNow })).toHaveCount(0)
})

test('a card without a status links to the trends', async ({ page }) => {
  await openApp(page, { at: MORNING, tables })
  await page.getByRole('link', { name: wording.trends.see }).click()
  await expect(page.getByRole('heading', { name: wording.trends.title, level: 1 })).toBeVisible()
})

test('the "Not enough data" card links to the trends too', async ({ page }) => {
  const notEnough = { ...tables, daily_status: [{ ...tables.daily_status[0], no_status_reason: 'not_enough_data' }] }
  await openApp(page, { at: '2026-09-29T12:10:00-05:00', tables: notEnough })
  await expect(page.getByRole('heading', { name: wording.states.notEnoughData.headline })).toBeVisible()
  await page.getByRole('link', { name: wording.trends.see }).click()
  await expect(page.getByRole('heading', { name: wording.trends.title, level: 1 })).toBeVisible()
})

test('a card with a status keeps the trends in Why today, not on the card', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: { ...answered, daily_status: [statusRow], uploads: synced } })
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: wording.trends.see })).toHaveCount(0)
})

// R23: the card with Sync now and the extra row still fits one screen.
test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('the no-sleep-stages card with Sync now and the trends row fits', async ({ page }) => {
    await openApp(page, { at: MORNING, tables })
    await expect(page.getByRole('link', { name: wording.trends.see })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0)
  })
})
