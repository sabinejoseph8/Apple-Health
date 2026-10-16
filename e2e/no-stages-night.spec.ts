import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { openApp, TZ } from './fixtures/mock-app'
import { MORNING, nights, statusRow, synced, whyTables } from './fixtures/sample-data'

// D92: a night the Watch recorded without stages still counts. Its status
// says so on the card, on Why today and on a past day.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const answered = { checkins: [{ answer: 'okay' }] }
const withNoStages = (date: string) => nights.map((n) => (n.night_date === date ? { ...n, no_stages: true } : { ...n, no_stages: false }))
const tables = (date: string, extra: object = {}) => ({
  ...answered,
  ...whyTables,
  nights: withNoStages(date),
  daily_status: [statusRow],
  uploads: synced,
  ...extra,
})

test('the card says the night had no stages, and keeps its status', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: tables('2026-09-29') })
  await expect(page.getByText(wording.card.noStages)).toBeVisible()
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
})

test('a night with stages has no note', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: tables('2026-09-20') })
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
  await expect(page.getByText(wording.card.noStages)).toHaveCount(0)
})

test('Why today says it too', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: tables('2026-09-29'), path: '/#/why' })
  await expect(page.getByText(wording.card.noStages)).toBeVisible()
})

test('a past day says it about that night', async ({ page }) => {
  const day = { ...statusRow, date: '2026-09-28', status: 'ready', nudge: 'train_as_planned' }
  await openApp(page, {
    at: MORNING,
    tables: tables('2026-09-28', { daily_status: [day, statusRow] }),
    path: '/#/day/2026-09-28',
  })
  await expect(page.getByText(wording.pastDay.noStages)).toBeVisible()
  await expect(page.getByText(wording.card.noStages)).toHaveCount(0)
})

// R23: the card with the extra line still fits one screen.
test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('the card with the note fits', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: tables('2026-09-29') })
    await expect(page.getByText(wording.card.noStages)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0)
  })
})
