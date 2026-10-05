import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { dailySync, openApp, TZ } from './fixtures/mock-app'
import { MORNING, statusRow, synced } from './fixtures/sample-data'

// D84: while last night isn't in, before noon, the card offers Sync now,
// which runs the Clarivi Sync Shortcut with the input "button".
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const answered = { checkins: [{ answer: 'okay' }] }
const none = (reason: string) => ({ ...statusRow, status: 'none', no_status_reason: reason, nudge: null, total: null, readings_used: 0, points: {} })
const URL_ = 'shortcuts://run-shortcut?name=Clarivi%20Sync&input=text&text=button'

const offered: [string, string, Record<string, unknown[]>][] = [
  ['waiting for the sync', MORNING, { ...answered, uploads: [dailySync('2026-09-28T06:51:00-05:00')] }],
  ['sleep still in progress', MORNING, { ...answered, daily_status: [none('night_unfinished')], uploads: [dailySync('2026-09-29T06:42:00-05:00', { night_complete: false })] }],
  ['no sync yet at 11:40', '2026-09-29T11:40:00-05:00', answered],
]
for (const [name, at, tables] of offered) {
  test(`offers Sync now: ${name}`, async ({ page }) => {
    await openApp(page, { at, tables })
    const button = page.getByRole('link', { name: wording.card.syncNow })
    await expect(button).toHaveAttribute('href', URL_)
    await expect(page.getByText(wording.card.syncNowHint)).toBeVisible()
  })
}

const notOffered: [string, string, Record<string, unknown[]>][] = [
  ['once there is a status', MORNING, { ...answered, daily_status: [statusRow], uploads: synced }],
  ['after noon', '2026-09-29T12:10:00-05:00', answered],
]
for (const [name, at, tables] of notOffered) {
  test(`no Sync now ${name}`, async ({ page }) => {
    await openApp(page, { at, tables })
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: wording.card.syncNow })).toHaveCount(0)
  })
}

// The button must not push the waiting card past one screen (R23).
test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('the sleep-in-progress card with Sync now still fits', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: offered[1][2] })
    await expect(page.getByRole('link', { name: wording.card.syncNow })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0)
  })
})
