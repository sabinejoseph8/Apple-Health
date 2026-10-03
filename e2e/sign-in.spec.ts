import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'

test.describe('sign-in screen on an iPhone', () => {
  test('shows the form and the contact line (R2, R5)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: wording.signIn.title })).toBeVisible()
    await expect(page.getByLabel(wording.signIn.email)).toBeVisible()
    await expect(page.getByLabel(wording.signIn.password)).toBeVisible()
    await expect(page.getByRole('button', { name: wording.signIn.submit })).toBeVisible()
    await expect(page.getByText(wording.signIn.forgot)).toBeVisible()
  })

  test('fits the screen width with no sideways scrolling', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: wording.signIn.title })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('has tap targets of at least 44 points', async ({ page }) => {
    await page.goto('/')
    for (const el of [
      page.getByLabel(wording.signIn.email),
      page.getByLabel(wording.signIn.password),
      page.getByRole('button', { name: wording.signIn.submit }),
    ]) {
      const box = await el.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  })

  test('is installable: manifest, Home Screen icon and service worker', async ({ page, request }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png')
    const manifest = await (await request.get('/manifest.webmanifest')).json()
    expect(manifest.display).toBe('standalone')
    const sw = await request.get('/sw.js')
    expect(sw.ok()).toBe(true)
  })
})
