import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { openApp, TZ } from './fixtures/mock-app'

// The service worker would take requests past the made-up answers.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const w = wording.owner
const MORNING = '2026-09-29T06:50:00-05:00'
const status = {
  database_mb: 42.5,
  people: [
    { name: 'owner@example.test', is_owner: true, last_sync: '2026-09-29T11:42:00Z', reminder_days: [], reminders_in_a_row: false, failures: 0, import_months: 12 },
    {
      name: 'tester@example.test',
      is_owner: false,
      last_sync: '2026-09-27T12:05:00Z',
      reminder_days: ['2026-09-29', '2026-09-28'],
      reminders_in_a_row: true,
      failures: 1,
      import_months: 5,
    },
  ],
}

test.describe("the owner's page (R64)", () => {
  test('opens from Settings for the owner and shows each person', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: { profiles: [{ is_owner: true }], 'rpc/owner_status': status as never }, path: '/#/settings' })
    await page.getByRole('link', { name: w.link }).click()
    await expect(page.getByRole('heading', { name: w.title, level: 1 })).toBeVisible()
    await expect(page.getByText(w.database('42.5'))).toBeVisible()
    const tester = page.getByRole('region', { name: 'tester@example.test' })
    await expect(tester).toContainText(w.reminders(2))
    await expect(tester).toContainText(w.inARow)
    await expect(tester).toContainText(w.failures(1))
    await expect(tester).toContainText(w.importSome(5))
    await expect(page.getByRole('region', { name: 'owner@example.test' })).toContainText(w.importAll)
  })

  test('is not offered to a tester, and refuses one who finds it', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: { profiles: [{ is_owner: false }] }, path: '/#/settings' })
    await expect(page.getByRole('heading', { name: wording.settings.account })).toBeVisible()
    await expect(page.getByRole('link', { name: w.link })).toHaveCount(0)
    await page.route('http://127.0.0.1:54321/rest/v1/rpc/owner_status', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'only the owner can see this' }) }),
    )
    await page.evaluate(() => (window.location.hash = '/owner'))
    await expect(page.getByText(w.notOwner)).toBeVisible()
  })
})
