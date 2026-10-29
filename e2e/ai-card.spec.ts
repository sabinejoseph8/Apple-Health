import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { openApp, TZ } from './fixtures/mock-app'
import { MORNING, statusRow, synced, whyTables } from './fixtures/sample-data'

// D95, R70, option B: the whole card waits for the AI's explanation, for up to
// 3 minutes after the status was written; then it shows with the fixed briefing.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const s = wording.states.writing
const answered = { checkins: [{ answer: 'okay' }] }
const written = (minutesAgo: number) => ({ ...statusRow, computed_at: new Date(new Date(MORNING).getTime() - minutesAgo * 60_000).toISOString() })
const aiText = { status: statusRow.status, nudge: statusRow.nudge, body: { explanation: 'A made-up explanation, written by the AI for this morning.' } }
const tables = (extra: object = {}) => ({ ...answered, ...whyTables, daily_status: [written(1)], uploads: synced, ai_texts: [], ...extra })

test('the whole card waits while the AI writes, with no status and no fixed briefing', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: tables() })
  await expect(page.getByText(s.pill, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: s.headline })).toBeVisible()
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toHaveCount(0)
  await expect(page.getByText("A short night, and your body hasn't fully recovered")).toHaveCount(0)
  await expect(page.getByText('You slept much less than usual')).toHaveCount(0)
})

test('then the status, headline and the AI explanation appear together', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: tables({ ai_texts: [aiText] }) })
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: "A short night, and your body hasn't fully recovered" })).toBeVisible()
  await expect(page.getByText(aiText.body.explanation)).toBeVisible()
  await expect(page.getByText('You slept much less than usual')).toHaveCount(0)
  await expect(page.getByText(s.headline)).toHaveCount(0)
})

test('after 3 minutes with no text the card shows with the fixed briefing', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: tables({ daily_status: [written(5)] }) })
  await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
  await expect(page.getByText('You slept much less than usual', { exact: false })).toBeVisible()
  await expect(page.getByText(s.headline)).toHaveCount(0)
})

test('a text written for another status is not shown', async ({ page }) => {
  await openApp(page, { at: MORNING, tables: tables({ daily_status: [written(5)], ai_texts: [{ ...aiText, status: 'rest' }] }) })
  await expect(page.getByText(aiText.body.explanation)).toHaveCount(0)
  await expect(page.getByText('You slept much less than usual', { exact: false })).toBeVisible()
})

test('the checks refresh the card as soon as the text is written', async ({ page }) => {
  const rows: object[] = []
  await openApp(page, { at: MORNING, tables: tables({ ai_texts: rows }) })
  await expect(page.getByRole('heading', { name: s.headline })).toBeVisible()
  rows.push(aiText)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText(aiText.body.explanation)).toBeVisible({ timeout: 15_000 })
})

test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  test('a card with a long AI explanation still fits one screen (R23)', async ({ page }) => {
    const long = 'Your heart rate variability was below your usual range, which usually means your body is still recovering. Today is a day to take it a little easier. Your sleep and the heart rate while you slept were in your usual range, and there was no early sign.'
    await openApp(page, { at: MORNING, tables: tables({ ai_texts: [{ ...aiText, body: { explanation: long } }] }) })
    await expect(page.getByText(long)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0)
  })

  test('the waiting card fits too', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: tables() })
    await expect(page.getByRole('heading', { name: s.headline })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0)
  })
})
