import { expect, type Page, test } from '@playwright/test'
import { openApp, TZ } from './fixtures/mock-app'
import { MORNING, statusRow, synced, whyTables, zones } from './fixtures/sample-data'

// Phase 6: the built app, served with the live site's security headers
// (vercel.json, with the made-up database in place of the live project),
// runs with no blocked code and talks to nothing but itself and the database.
const APP = 'http://localhost:5175'
const DATABASE = 'http://127.0.0.1:54321'
test.use({ baseURL: APP, timezoneId: TZ, serviceWorkers: 'block' })

const tables = {
  daily_status: [statusRow],
  uploads: synced,
  checkins: [{ answer: 'okay' }],
  ...whyTables,
  'rpc/status_zones': [zones],
}

// Collects anything the policy blocked, and any request to another site.
async function watch(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => {
    if (/content security policy|refused to/i.test(m.text())) problems.push(m.text())
  })
  page.on('request', (r) => {
    const origin = new URL(r.url()).origin
    if (origin !== APP && origin !== DATABASE) problems.push(`request to another site: ${r.url()}`)
  })
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`Content Security Policy blocked ${e.blockedURI} (${e.violatedDirective})`),
    ),
  )
  return problems
}

test('the app is served with the strict policy', async ({ request }) => {
  const res = await request.get('/')
  expect(res.headers()['content-security-policy']).toContain("script-src 'self';")
  expect(res.headers()['referrer-policy']).toBe('no-referrer')
})

test('the setup guide works under the policy', async ({ page }) => {
  const problems = await watch(page)
  await page.goto('/#/guide')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(problems).toEqual([])
})

test('sign-in works under the policy', async ({ page }) => {
  const problems = await watch(page)
  await page.goto('/')
  await expect(page.getByLabel('Password')).toBeVisible()
  expect(problems).toEqual([])
})

for (const [screen, path] of [
  ['the card', '/'],
  ['Why today', '/#/why'],
  ['trends', '/#/trends'],
  ['Settings', '/#/settings'],
  ['the weekly digest', '/#/digest'],
]) {
  test(`${screen} works under the policy`, async ({ page }) => {
    const problems = await watch(page)
    await openApp(page, { at: MORNING, tables, path })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Let the screen finish loading its data.
    await page.waitForLoadState('networkidle')
    expect(problems).toEqual([])
  })
}
