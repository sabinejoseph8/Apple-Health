import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { sleepFloorDay } from '../src/lib/sample-days'
import { openApp, TZ } from './fixtures/mock-app'
import { MORNING, TODAY, synced, whyTables } from './fixtures/sample-data'

// D96: a night of sleep far below the usual cannot be Ready. The card, Why
// today and a past day say that sleep alone set Ease off.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const floorRow = (date: string) => ({ ...sleepFloorDay, date, no_status_reason: null, settings_version: 3 })
const tables = (extra: object = {}) => ({
  ...whyTables,
  checkins: [{ answer: 'okay' }],
  daily_status: [floorRow(TODAY)],
  uploads: synced,
  ...extra,
})

test('the card says a very short night set Ease off', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: tables() })
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: wording.briefing.headline.ease_off.sleepFloor })).toBeVisible()
  await expect(page.getByText(wording.briefing.meaning.sleepFloor)).toBeVisible()
  await expect(page.getByText(wording.briefing.worse.sleep.replace(/^you/, 'You'), { exact: false }).first()).toBeVisible()
})

test('Why today says sleep alone set it, and how the rule works', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: tables(), path: '/#/why' })
  await expect(page.getByRole('heading', { name: wording.why.floor.headline })).toBeVisible()
  await expect(page.getByText(wording.why.floor.body)).toBeVisible()
  await expect(page.getByText(wording.why.decided.addsFloor, { exact: false })).toBeVisible()
  await expect(page.getByText(wording.why.decided.floorRule, { exact: false })).toBeVisible()
})

test('a past day says it about that night', async ({ page }) => {
  await openApp(page, {
    at: MORNING,
    tables: tables({ daily_status: [floorRow('2026-09-28'), floorRow(TODAY)] }),
    path: '/#/day/2026-09-28',
  })
  await expect(page.getByRole('heading', { name: wording.pastDay.summary.floor.headline })).toBeVisible()
  await expect(page.getByText(wording.pastDay.addsFloor, { exact: false })).toBeVisible()
})

// R23: the morning card still fits one screen.
test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('the sleep floor card fits', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: tables() })
    await expect(page.getByRole('heading', { name: wording.briefing.headline.ease_off.sleepFloor })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0)
  })
})
