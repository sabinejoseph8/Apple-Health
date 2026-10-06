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

test('Settings shows the Shortcut link and the guide beside the upload token (R10)', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: { upload_tokens: [] }, path: '/#/settings' })
  const card = page.locator('section', { has: page.getByRole('heading', { name: wording.uploadToken.title }) })
  await expect(card.getByRole('link', { name: wording.uploadToken.getShortcut })).toHaveAttribute('href', SHORTCUT)
  await card.getByRole('link', { name: wording.uploadToken.guide }).click()
  await expect(page.getByRole('heading', { name: g.title, level: 1 })).toBeVisible()
  await page.getByRole('button', { name: g.back }).click()
  await expect(page.getByRole('heading', { name: wording.uploadToken.title })).toBeVisible()
})

test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('fits the screen width', async ({ page }) => {
    await page.goto('/#/guide')
    await expect(page.getByRole('heading', { name: g.title, level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
