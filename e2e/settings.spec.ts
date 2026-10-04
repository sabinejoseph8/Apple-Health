import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { openApp, TZ } from './fixtures/mock-app'

// The service worker would take requests past the made-up answers.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const w = wording.settings
const MORNING = '2026-09-29T06:50:00-05:00'

test.describe('Settings on an iPhone', () => {
  test('lists the account actions, with Delete my data in red', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: {}, path: '/#/settings' })
    await expect(page.getByRole('heading', { name: w.account })).toBeVisible()
    for (const name of [w.changePassword, w.signOutEverywhere, w.deleteData]) {
      const row = page.getByRole('button', { name })
      await expect(row).toBeVisible()
      expect((await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    const red = await page.getByRole('button', { name: w.deleteData }).evaluate((el) => getComputedStyle(el).color)
    expect(red).toBe('rgb(161, 38, 29)')
  })

  test('changes the password after checking the current one (R4)', async ({ page }) => {
    const app = await openApp(page, {
      at: MORNING,
      tables: { 'fn/account-change-password': [{ status: 401, body: { error: 'wrong_password' } }] },
      path: '/#/settings',
    })
    await page.getByRole('button', { name: w.changePassword }).click()
    await page.getByLabel(w.currentPassword).fill('not-my-password')
    await page.getByLabel(w.newPassword).fill('a-brand-new-password')
    await page.getByLabel(w.confirmPassword).fill('a-brand-new-password')
    await page.getByRole('button', { name: w.save }).click()
    await expect(page.getByRole('alert')).toHaveText(w.wrongCurrent)

    await page.getByLabel(w.currentPassword).fill('my-current-password')
    await page.getByRole('button', { name: w.save }).click()
    await expect(page.getByRole('status')).toHaveText(w.passwordChanged)
    expect(app.calls.filter((c) => c.name === 'fn:account-change-password').at(-1)?.body).toEqual({
      current: 'my-current-password',
      password: 'a-brand-new-password',
    })
    // Saving a password ends every session, so this phone signs straight back in.
    expect(app.calls.some((c) => c.name === 'auth:sign-in')).toBe(true)
  })

  test('checks a new password before sending it', async ({ page }) => {
    const app = await openApp(page, { at: MORNING, tables: {}, path: '/#/settings' })
    await page.getByRole('button', { name: w.changePassword }).click()
    await page.getByLabel(w.currentPassword).fill('my-current-password')
    await page.getByLabel(w.newPassword).fill('too-short')
    await page.getByLabel(w.confirmPassword).fill('too-short')
    await page.getByRole('button', { name: w.save }).click()
    await expect(page.getByRole('alert')).toHaveText(wording.setPassword.tooShort)
    expect(app.calls.some((c) => c.name === 'fn:account-change-password')).toBe(false)
  })

  test('deletes data only with the password, and says so (R8, R59)', async ({ page }) => {
    const app = await openApp(page, {
      at: MORNING,
      tables: { 'fn/account-delete-data': [{ status: 401, body: { error: 'wrong_password' } }] },
      path: '/#/settings',
    })
    await page.getByRole('button', { name: w.deleteData }).click()
    await expect(page.getByText(w.deleteNote)).toBeVisible()
    await page.getByLabel(w.password, { exact: true }).fill('not-my-password')
    await page.getByRole('button', { name: w.deleteData }).click()
    await expect(page.getByRole('alert')).toHaveText(w.wrongPassword)
    const tokenReadsBefore = app.reads.filter((r) => r === 'upload_tokens').length
    await page.getByLabel(w.password, { exact: true }).fill('my-password')
    await page.getByRole('button', { name: w.deleteData }).click()
    await expect(page.getByRole('status')).toHaveText(w.deleted)
    // The token and phones shown above are read again, so they show as gone.
    await expect.poll(() => app.reads.filter((r) => r === 'upload_tokens').length).toBeGreaterThan(tokenReadsBefore)
    expect(app.calls.filter((c) => c.name === 'fn:account-delete-data').map((c) => c.body)).toEqual([
      { password: 'not-my-password' },
      { password: 'my-password' },
    ])
  })

  test('Cancel leaves everything as it was', async ({ page }) => {
    const app = await openApp(page, { at: MORNING, tables: {}, path: '/#/settings' })
    await page.getByRole('button', { name: w.deleteData }).click()
    await page.getByRole('button', { name: w.cancel }).click()
    await expect(page.getByRole('heading', { name: w.account })).toBeVisible()
    expect(app.calls.some((c) => c.name.startsWith('fn:'))).toBe(false)
  })

  test('signs out everywhere (R7)', async ({ page }) => {
    const app = await openApp(page, { at: MORNING, tables: {}, path: '/#/settings' })
    await page.getByRole('button', { name: w.signOutEverywhere }).click()
    await expect(page.getByText(w.signOutEverywhereNote)).toBeVisible()
    await page.getByRole('button', { name: w.signOutEverywhere }).click()
    await expect(page.getByRole('heading', { name: wording.signIn.title })).toBeVisible()
    // Notifications stop on every device first, then every session ends.
    const names = app.calls.map((c) => c.name)
    expect(names.indexOf('forget_all_devices')).toBeGreaterThanOrEqual(0)
    expect(names.indexOf('forget_all_devices')).toBeLessThan(names.indexOf('auth:sign-out:global'))
  })

  test('a device signed out elsewhere goes straight to the sign-in screen (R7)', async ({ page }) => {
    await openApp(page, {
      at: MORNING,
      tables: { 'auth/user': [{ status: 403, body: { code: 'session_not_found', message: 'Session from session_id claim in JWT does not exist' } }] },
    })
    await expect(page.getByRole('heading', { name: wording.signIn.title })).toBeVisible()
  })

  test('being offline is not a sign-out', async ({ page }) => {
    const app = await openApp(page, { at: MORNING, tables: { 'auth/user': [{ status: 0, body: null }] }, path: '/#/settings' })
    await expect(page.getByRole('heading', { name: w.account })).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: w.account })).toBeVisible()
    expect(app.calls.some((c) => c.name.startsWith('auth:sign-out'))).toBe(false)
  })
})
