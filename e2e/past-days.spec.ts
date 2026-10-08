import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { dailySync, openApp, TZ } from './fixtures/mock-app'
import { MORNING, statusRow, synced, whyTables } from './fixtures/sample-data'

// D88: any past day opens as Why today for that date, with the date as the
// title and Previous day / Next day to step through. A card with a status
// reaches it from Why today; a card without one has a "Previous days" row.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const p = wording.pastDay
const answered = { checkins: [{ answer: 'okay' }] }
const ready27 = { ...statusRow, date: '2026-09-27', status: 'ready', nudge: 'train_as_planned' }
const ready28 = { ...statusRow, date: '2026-09-28', status: 'ready', nudge: 'train_as_planned' }
const noStages = { ...statusRow, status: 'none', no_status_reason: 'no_sleep_stages', nudge: null, total: null, readings_used: 0, points: {} }
// Oldest first: the first row is the first day Clarivi has.
const days = (...rows: object[]) => ({ ...answered, ...whyTables, uploads: synced, daily_status: rows })

test('from Why today, Previous day opens yesterday, and Next day comes back to today', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: days(ready27, ready28, statusRow), path: '/#/why' })
  await page.getByRole('button', { name: p.previous }).click()
  await expect(page.getByRole('heading', { name: 'Monday 28 September', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: p.thatNight, level: 2, exact: true })).toBeVisible()
  await expect(page.getByText(wording.card.status.ready).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: p.decidedTitle, level: 2 })).toBeVisible()
  await expect(page.getByText(p.adds.ready)).toBeVisible()
  await page.getByRole('button', { name: p.next }).click()
  await expect(page.getByRole('heading', { name: 'Tuesday 29 September', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: wording.why.lastNight, level: 2, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: wording.why.decided.title, level: 2 })).toBeVisible()
  await expect(page.getByRole('button', { name: p.next })).toHaveCount(0)
})

test('Previous day stops at the first day Clarivi has', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: days(ready28, statusRow), path: '/#/day/2026-09-28' })
  await expect(page.getByRole('heading', { name: 'Monday 28 September', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: p.next })).toBeVisible()
  await expect(page.getByRole('button', { name: p.previous })).toHaveCount(0)
})

test('a day with nothing says so, and the days around it still open', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: days(ready27, statusRow), path: '/#/day/2026-09-28' })
  await expect(page.getByText(p.nothing)).toBeVisible()
  await page.getByRole('button', { name: p.previous }).click()
  await expect(page.getByRole('heading', { name: 'Sunday 27 September', level: 1 })).toBeVisible()
})

test('a card without a status has a Previous days row, and Back returns to the card', async ({ page }) => {
  await openApp(page, {
    at: MORNING,
    tables: { ...days(ready28, noStages), uploads: [dailySync('2026-09-29T06:42:00-05:00', { night_complete: false })] },
  })
  await page.getByRole('link', { name: p.row }).click()
  await expect(page.getByRole('heading', { name: 'Monday 28 September', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: p.back }).click()
  await expect(page.getByRole('heading', { name: wording.states.noSleepStages.headline })).toBeVisible()
})

test('a past day without a status shows why, as the card did', async ({ page }) => {
  const past = { ...noStages, date: '2026-09-28' }
  await openApp(page, { at: MORNING, tables: days(past, statusRow), path: '/#/day/2026-09-28' })
  await expect(page.getByText(wording.states.noSleepStages.pill)).toBeVisible()
  await expect(page.getByRole('heading', { name: wording.states.noSleepStages.headline })).toBeVisible()
})

test('a card with a status keeps the way to past days in Why today', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: days(ready28, statusRow) })
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: p.row })).toHaveCount(0)
})

// R23: the card without a status, with Sync now and its three rows, still fits.
test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('the no-sleep-stages card with Sync now and both rows fits', async ({ page }) => {
    await openApp(page, {
      at: MORNING,
      tables: { ...days(ready28, noStages), uploads: [dailySync('2026-09-29T06:42:00-05:00', { night_complete: false })] },
    })
    await expect(page.getByRole('link', { name: p.row })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0)
  })
})
