import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { sampleDay } from '../src/lib/sample-days'
import { dailySync, openApp, TZ } from './fixtures/mock-app'

// Dark mode (D111, R76): the app follows the phone's light or dark setting, with the dark colour set from
// docs/design.md. The service worker would take requests past the made-up answers.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const MORNING = '2026-09-29T06:50:00-05:00'
const statusRow = { ...sampleDay, date: '2026-09-29', no_status_reason: null, settings_version: 2 }
const tables = { daily_status: [statusRow], uploads: [dailySync('2026-09-29T06:42:00-05:00')] }

async function colours(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: wording.checkin.answers.okay }).click()
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
  return page.evaluate(() => {
    const css = (el: Element | null, prop: string) => (el ? getComputedStyle(el).getPropertyValue(prop) : '')
    return {
      page: css(document.body, 'background-color'),
      card: css(document.querySelector('.card'), 'background-color'),
      headline: css(document.querySelector('h1'), 'color'),
      scheme: css(document.documentElement, 'color-scheme'),
      themeColours: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => `${m.getAttribute('media')} ${m.getAttribute('content')}`),
    }
  })
}

test.describe('on a phone set to dark', () => {
  test.use({ colorScheme: 'dark' })
  test('the page is black, cards are one step lighter and text is white', async ({ page }) => {
    await openApp(page, { at: MORNING, tables })
    const c = await colours(page)
    expect(c.page).toBe('rgb(0, 0, 0)')
    expect(c.card).toBe('rgb(28, 28, 30)')
    expect(c.headline).toBe('rgb(255, 255, 255)')
  })
})

test.describe('on a phone set to light', () => {
  test.use({ colorScheme: 'light' })
  test('the light colours are as before', async ({ page }) => {
    await openApp(page, { at: MORNING, tables })
    const c = await colours(page)
    expect(c.page).toBe('rgb(242, 242, 247)')
    expect(c.card).toBe('rgb(255, 255, 255)')
    expect(c.headline).toBe('rgb(0, 0, 0)')
  })

  test('both schemes are declared, with a status bar colour for each', async ({ page }) => {
    await openApp(page, { at: MORNING, tables })
    const c = await colours(page)
    expect(c.scheme).toContain('light')
    expect(c.scheme).toContain('dark')
    expect(c.themeColours).toEqual(['(prefers-color-scheme: light) #F2F2F7', '(prefers-color-scheme: dark) #000000'])
  })
})
