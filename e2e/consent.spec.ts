import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { openApp, TZ } from './fixtures/mock-app'
import { MORNING, statusRow, synced } from './fixtures/sample-data'

// Phase 6: consent (D79, D80). Nothing opens until both statements are
// agreed; Settings shows when, links to the text and withdraws.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const c = wording.consent
const tables = { daily_status: [statusRow], uploads: synced, checkins: [{ answer: 'okay' }] }

test('before agreeing, the consent text comes first and nothing else opens', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: { ...tables, consents: [] } })
  await expect(page.getByRole('heading', { name: c.title, level: 1 })).toBeVisible()
  for (const section of c.sections) await expect(page.getByRole('heading', { name: section.title })).toBeVisible()
  await expect(page.getByText('notions_close_5p@icloud.com', { exact: false })).toBeVisible()
  // Neither statement is ticked in advance.
  await expect(page.getByRole('checkbox', { name: c.agreeUse })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: c.agreeUs })).not.toBeChecked()
  await expect(page.getByRole('button', { name: wording.day.settings })).toHaveCount(0)
})

test('"I agree" needs both statements, then the app opens', async ({ page }) => {
  const app = await openApp(page, { at: MORNING, tables: { ...tables, consents: [] } })
  await page.getByRole('button', { name: c.agree }).click()
  await expect(page.getByRole('alert')).toHaveText(c.needBoth)
  await page.getByRole('checkbox', { name: c.agreeUse }).check()
  await page.getByRole('button', { name: c.agree }).click()
  await expect(page.getByRole('alert')).toHaveText(c.needBoth)
  expect(app.calls.find((x) => x.name === 'give_consent')).toBeUndefined()
  await page.getByRole('checkbox', { name: c.agreeUs }).check()
  await page.getByRole('button', { name: c.agree }).click()
  await expect(page.getByRole('heading', { name: c.title, level: 1 })).toHaveCount(0)
  expect(app.calls.find((x) => x.name === 'give_consent')?.body).toEqual({ p_version: 1, p_use: true, p_us_storage: true })
})

test('not agreeing costs nothing: Sign out', async ({ page }) => {
  const app = await openApp(page, { at: MORNING, tables: { ...tables, consents: [] } })
  await page.getByRole('button', { name: c.signOut }).click()
  await expect(page.getByLabel(wording.signIn.password)).toBeVisible()
  expect(app.calls.some((x) => x.name.startsWith('auth:sign-out'))).toBe(true)
})

test('Settings shows when, links to the text, and Withdraw consent asks again (D80)', async ({ page }) => {
  const consents = [{ version: 1, agreed_at: '2026-09-01T12:00:00Z' }]
  const app = await openApp(page, { at: MORNING, tables: { ...tables, consents }, path: '/#/settings' })
  const card = page.locator('section', { has: page.getByRole('heading', { name: c.settingsTitle }) })
  await expect(card).toContainText(c.agreedOn('1 September 2026'))

  await card.getByRole('link', { name: c.read }).click()
  await expect(page.getByRole('heading', { name: c.pageTitle, level: 1 })).toBeVisible()
  await page.getByRole('button', { name: wording.guide.back }).click()

  // Withdrawing: the server deletes everything and ends the agreement.
  await page.route('**/functions/v1/account-withdraw-consent', async (route) => {
    app.calls.push({ name: 'fn:account-withdraw-consent', body: route.request().postDataJSON() })
    consents.length = 0
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.getByRole('button', { name: c.withdraw }).click()
  await expect(page.getByText(c.withdrawNote)).toBeVisible()
  await page.getByLabel(wording.settings.password).fill('my-password-123')
  await page.getByRole('button', { name: c.withdraw }).click()
  await expect(page.getByRole('heading', { name: c.title, level: 1 })).toBeVisible()
  expect(app.calls.find((x) => x.name === 'fn:account-withdraw-consent')?.body).toEqual({ password: 'my-password-123' })
})

test('the text is public as "Your data", and the guide links to it', async ({ page }) => {
  await page.goto('/#/guide')
  await page.getByRole('link', { name: c.guideLink }).click()
  await expect(page.getByRole('heading', { name: c.pageTitle, level: 1 })).toBeVisible()
  await expect(page.getByText(c.versionLine)).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
})

test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('the consent screen fits the screen width', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: { ...tables, consents: [] } })
    await expect(page.getByRole('heading', { name: c.title, level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
