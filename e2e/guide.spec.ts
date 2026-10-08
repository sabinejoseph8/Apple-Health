import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { openApp, TZ } from './fixtures/mock-app'
import { MORNING } from './fixtures/sample-data'

// Phase 6: the one-page setup guide (D78; R10, R62), public before sign-in.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const g = wording.guide
const SHORTCUT = /^https:\/\/www\.icloud\.com\/shortcuts\/[0-9a-f]{32}$/

test('opens from the sign-in screen, without signing in, and goes back', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: wording.signIn.guide }).click()
  await expect(page.getByRole('heading', { name: g.title, level: 1 })).toBeVisible()
  for (const [i, section] of g.sections.entries()) {
    await expect(page.getByRole('heading', { name: `${i + 1}. ${section.title}` })).toBeVisible()
  }
  // Its own address, so a tester knows what to open in Safari.
  await expect(page.getByText(g.address('localhost:5174'))).toBeVisible()
  await page.getByRole('button', { name: g.back }).click()
  await expect(page.getByLabel(wording.signIn.password)).toBeVisible()
})

test('a link straight to the guide works too', async ({ page }) => {
  await page.goto('/#/guide')
  await expect(page.getByRole('heading', { name: g.title, level: 1 })).toBeVisible()
  await expect(page.getByText(g.contact)).toBeVisible()
})

test('links to the Shortcut, opening outside the app', async ({ page }) => {
  await page.goto('/#/guide')
  const link = page.getByRole('link', { name: wording.uploadToken.getShortcut })
  await expect(link).toHaveAttribute('href', SHORTCUT)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
})

test('explains the lock screen and When Unlocked (R62)', async ({ page }) => {
  await page.goto('/#/guide')
  await expect(page.getByText(/Show Previews, and choose When Unlocked/)).toBeVisible()
})

test('says to tap Always Allow when Sync now first asks to output its item', async ({ page }) => {
  await page.goto('/#/guide')
  await expect(page.getByText(/Allow Clarivi Sync to output 1 text item\?.*Tap Always Allow\./)).toBeVisible()
})

test('says to unlock and tap Continue when a locked run asks to carry on', async ({ page }) => {
  await page.goto('/#/guide')
  await expect(page.getByText(/Find Health Samples Where: Tap to run.*unlock your iPhone and tap Continue\./)).toBeVisible()
})

test('Settings shows the Shortcut link and the guide beside the upload token (R10)', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: { upload_tokens: [] }, path: '/#/settings' })
  const card = page.locator('section', { has: page.getByRole('heading', { name: wording.uploadToken.title }) })
  await expect(card.getByRole('link', { name: wording.uploadToken.getShortcut })).toHaveAttribute('href', SHORTCUT)
  await card.getByRole('link', { name: wording.uploadToken.guide }).click()
  await expect(page.getByRole('heading', { name: g.title, level: 1 })).toBeVisible()
  await page.getByRole('button', { name: g.back }).click()
  await expect(page.getByRole('heading', { name: wording.uploadToken.title })).toBeVisible()
})

test('while a new token is on screen, the guide link waits, as leaving Settings would lose the token', async ({ page }) => {
  await openApp(page, {
    at: MORNING,
    tables: { upload_tokens: [], 'fn/account-token': [{ status: 200, body: { token: `clv_${'x'.repeat(43)}` } }] },
    path: '/#/settings',
  })
  const t = wording.uploadToken
  const card = page.locator('section', { has: page.getByRole('heading', { name: t.title }) })
  await card.getByRole('button', { name: t.create }).click()
  await card.getByLabel(t.password).fill('made-up password')
  await card.getByRole('button', { name: t.create }).click()
  await expect(card.getByText(t.showOnce)).toBeVisible()
  await expect(card.getByRole('link', { name: t.guide })).toHaveCount(0)
  await expect(card.getByRole('link', { name: t.getShortcut })).toBeVisible()
  await card.getByRole('button', { name: t.done }).click()
  await expect(card.getByRole('link', { name: t.guide })).toBeVisible()
})

test('signed in, Your data opens over the app, and Back returns without asking about consent again', async ({ page }) => {
  const app = await openApp(page, { at: MORNING, tables: {}, path: '/#/settings' })
  const consent = page.locator('section', { has: page.getByRole('heading', { name: wording.consent.settingsTitle }) })
  const reads = () => app.reads.filter((r) => r === 'consents').length
  await expect(consent.locator('.caption')).toBeVisible()
  // So far the consent check and the Settings card have each read it, equally often.
  const opened = reads()
  await consent.getByRole('link', { name: wording.consent.read }).click()
  await expect(page.getByRole('heading', { name: wording.consent.pageTitle, level: 1 })).toBeVisible()
  await page.getByRole('button', { name: g.back }).click()
  await expect(consent.locator('.caption')).toBeVisible()
  // Back on Settings, only its card reads it again: the consent check doesn't run again.
  expect(reads() - opened).toBe(opened / 2)
})

test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('fits the screen width', async ({ page }) => {
    await page.goto('/#/guide')
    await expect(page.getByRole('heading', { name: g.title, level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
