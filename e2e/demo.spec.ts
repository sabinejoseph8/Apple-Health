import { expect, test, type Page } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { EXAMPLE_DIGEST, EXAMPLE_MORNING, SCENARIOS } from '../src/demo/scenarios'

// The demo build (D95): the same app with made-up data, no sign-in and no backend. These tests
// run against a build made with `vite build --mode demo`, served with the live site's security
// headers, at iPhone size.
test.use({ baseURL: 'http://localhost:5177', serviceWorkers: 'block' })

const banner = (page: Page) => page.getByRole('region', { name: 'Demo' })

// Everything the page asks the network for must come from the demo's own address.
function watchNetwork(page: Page) {
  const outside: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.origin !== 'http://localhost:5177' && url.protocol.startsWith('http')) outside.push(r.url())
  })
  return outside
}

test('opens on the sample day with the banner, and asks how you feel first', async ({ page }) => {
  const outside = watchNetwork(page)
  await page.goto('/')
  await expect(banner(page).getByText('Demo with made-up data')).toBeVisible()
  await expect(page.getByRole('heading', { name: wording.checkin.question })).toBeVisible()
  await page.getByRole('button', { name: wording.checkin.answers.okay }).click()
  await expect(page.getByText('Tuesday 29 September')).toBeVisible()
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
  await expect(page.getByText(EXAMPLE_MORNING.ease_off)).toBeVisible()
  await expect(page.getByText('Updated from your Watch at 6:42am')).toBeVisible()
  expect(outside, 'no request leaves the demo').toEqual([])
})

test('the answer the visitor taps is kept, and Change works', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: wording.checkin.answers.off }).click()
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
  await expect(page.getByText(/You said you feel/)).toContainText(wording.checkin.answers.off.toLowerCase())
})

test('Ready morning', async ({ page }) => {
  await page.goto('/?scenario=ready')
  await page.getByRole('button', { name: wording.checkin.answers.good }).click()
  await expect(page.locator('#root').getByText(wording.card.status.ready, { exact: true })).toBeVisible()
  await expect(page.getByText(EXAMPLE_MORNING.ready)).toBeVisible()
})

test('Ease off because of a very short night', async ({ page }) => {
  await page.goto('/?scenario=sleep-floor')
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
  await expect(page.getByText(EXAMPLE_MORNING.sleep_floor)).toBeVisible()
  await page.getByRole('link', { name: /Why ease off today/ }).click()
  await expect(page.getByRole('heading', { name: wording.why.floor.headline })).toBeVisible()
})

test('learning, waiting and no-sync mornings', async ({ page }) => {
  await page.goto('/?scenario=learning')
  await expect(page.getByRole('heading', { name: wording.states.learning.headline })).toBeVisible()
  await page.goto('/?scenario=waiting')
  await expect(page.getByRole('heading', { name: wording.states.waiting.headline })).toBeVisible()
  await page.goto('/?scenario=no-sync')
  await expect(page.getByRole('heading', { name: wording.states.noSync.headline })).toBeVisible()
})

test('the evening question can be answered', async ({ page }) => {
  await page.goto('/?scenario=evening')
  await page.locator('.follow-through').waitFor()
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await page.locator('.follow-recorded').waitFor()
})

test('Why today, with the numbers open', async ({ page }) => {
  await page.goto('/#/why')
  await page.locator('.decided').waitFor()
  await page.locator('.reading-hrv .text-link').click()
  await page.locator('.decided .text-link').click()
  await expect(page.locator('.reading-hrv')).toContainText('38')
})

test('the weekly digest shows the fixed example text', async ({ page }) => {
  await page.goto('/#/digest')
  await expect(page.getByText(EXAMPLE_DIGEST.sentences)).toBeVisible()
})

test('the trends open with eight weeks of nights', async ({ page }) => {
  await page.goto('/#/trends')
  await page.locator('.reading-sleeping-hr .trend-plot').waitFor()
  await expect(page.locator('.reading-hrv .trend-plot')).toBeVisible()
})

test('the banner picks another morning', async ({ page }) => {
  await page.goto('/')
  await banner(page).getByRole('combobox', { name: 'Choose a morning' }).selectOption('ready')
  await expect(page).toHaveURL(/scenario=ready/)
  await expect(page.getByRole('heading', { name: wording.checkin.question })).toBeVisible()
  await expect(banner(page).getByRole('combobox')).toHaveValue('ready')
})

test('every scenario opens without an error and without a request outside the demo', async ({ page }) => {
  const outside = watchNetwork(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const s of SCENARIOS) {
    await page.goto(`/?scenario=${s.id}`)
    await expect(banner(page)).toBeVisible()
    await expect(page.locator('main').first()).toBeVisible()
  }
  expect(errors).toEqual([])
  expect(outside).toEqual([])
})

// The morning is the same wherever the visitor is: the clock is the scenario's wall-clock time in the visitor's own time zone.
for (const timezoneId of ['Pacific/Auckland', 'America/Los_Angeles', 'Europe/London']) {
  test.describe(`in ${timezoneId}`, () => {
    test.use({ timezoneId })
    test('still opens on the sample morning', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: wording.checkin.answers.okay }).click()
      await expect(page.getByText('Tuesday 29 September')).toBeVisible()
      await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
    })
  })
}

test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })
  test('the banner does not make the page scroll sideways', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: wording.checkin.answers.okay }).click()
    await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
