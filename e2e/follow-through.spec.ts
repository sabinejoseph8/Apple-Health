import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { openApp, TZ } from './fixtures/mock-app'
import { statusRow, synced, TODAY } from './fixtures/sample-data'

// The service worker would take requests past the made-up answers.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

const f = wording.followThrough
const EVENING = '2026-09-29T20:00:00-05:00'
// The design's sample day was shown as Ease off with "Train easy today".
const shownEaseOff = [{ date: TODAY, nudge: 'train_easy', shown_at: '2026-09-29T11:44:00Z' }]
const day = { daily_status: [statusRow], uploads: synced, checkins: [{ answer: 'okay' }], shown_status: shownEaseOff }

test.describe('the 8pm question on an iPhone', () => {
  test('is not asked before 8pm (R52)', async ({ page }) => {
    await openApp(page, { at: '2026-09-29T19:59:00-05:00', tables: day })
    await expect(page.getByText(wording.card.nudgeLabel)).toBeVisible()
    await expect(page.getByText(f.question)).toHaveCount(0)
  })

  test('sits at the top from 8pm, with equal Yes and No and the briefing folded (R53)', async ({ page }) => {
    await openApp(page, { at: EVENING, tables: day })
    await expect(page.getByRole('heading', { name: 'Good evening' })).toBeVisible()
    await expect(page.getByText(f.question)).toBeVisible()
    const yes = await page.getByRole('button', { name: f.yes, exact: true }).boundingBox()
    const no = await page.getByRole('button', { name: f.no, exact: true }).boundingBox()
    expect(yes?.width).toBe(no?.width)
    expect(yes?.height).toBe(no?.height)
    expect(yes?.height ?? 0).toBeGreaterThanOrEqual(48)
    // The question card comes before the briefing card.
    const question = await page.locator('.follow-through').boundingBox()
    const briefingCard = await page.locator('.briefing').boundingBox()
    expect(question!.y).toBeLessThan(briefingCard!.y)
    // The briefing folds to its headline, the nudge block is left out.
    await expect(page.getByRole('heading', { name: "A short night, and your body hasn't fully recovered" })).toBeVisible()
    await expect(page.getByText('You slept much less than usual', { exact: false })).toHaveCount(0)
    await expect(page.locator('.nudge')).toHaveCount(0)
    await page.getByRole('button', { name: f.showBriefing }).click()
    await expect(page.getByText('You slept much less than usual', { exact: false })).toBeVisible()
  })

  test('records the answer from the card, and Change lets it be changed (R54, R56)', async ({ page }) => {
    const app = await openApp(page, { at: EVENING, tables: day })
    await page.getByRole('button', { name: f.yes, exact: true }).click()
    await expect(page.getByText(f.followed)).toBeVisible()
    expect(app.calls.find((c) => c.name === 'submit_followthrough')?.body).toEqual({ p_date: TODAY, p_answer: 'yes', p_channel: 'card' })
    await page.getByRole('button', { name: f.change }).first().click()
    await page.getByRole('button', { name: f.no, exact: true }).click()
    await expect(page.getByText(f.notFollowed)).toBeVisible()
    expect(app.calls.filter((c) => c.name === 'submit_followthrough').map((c) => (c.body as { p_answer: string }).p_answer)).toEqual(['yes', 'no'])
  })

  test('asks about the nudge that was shown, not a later recalculation (D61)', async ({ page }) => {
    // The morning showed train as planned; the status has since become Ease off.
    await openApp(page, {
      at: EVENING,
      tables: { ...day, shown_status: [{ date: TODAY, nudge: 'train_as_planned', shown_at: '2026-09-29T11:44:00Z' }] },
    })
    await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
    await expect(page.getByText(f.question)).toHaveCount(0)
  })

  test('first opened at 8pm, the card records what it shows before the answer is saved', async ({ page }) => {
    const app = await openApp(page, { at: EVENING, tables: { ...day, shown_status: [] } })
    await page.getByRole('button', { name: f.yes, exact: true }).click()
    await expect(page.getByText(f.followed)).toBeVisible()
    const names = app.calls.map((c) => c.name)
    expect(names.lastIndexOf('record_shown')).toBeLessThan(names.indexOf('submit_followthrough'))
  })

  test('is never asked on a train-as-planned day (R50)', async ({ page }) => {
    const ready = { ...statusRow, status: 'ready', nudge: 'train_as_planned' }
    await openApp(page, {
      at: EVENING,
      tables: { ...day, daily_status: [ready], shown_status: [{ date: TODAY, nudge: 'train_as_planned', shown_at: '2026-09-29T11:44:00Z' }] },
    })
    await expect(page.getByText(wording.card.status.ready, { exact: true })).toBeVisible()
    await expect(page.getByText(f.question)).toHaveCount(0)
  })

  test('opened from the 8pm notification: the tap is logged and the answer counts as given there (R51, R56)', async ({ page }) => {
    const app = await openApp(page, { at: EVENING, tables: day, path: '/?n=12&k=followup' })
    await expect.poll(() => app.calls.find((c) => c.name === 'log_notification_tap')?.body).toEqual({ p_id: 12 })
    await expect.poll(() => page.evaluate(() => window.location.search)).toBe('')
    await page.getByRole('button', { name: f.no, exact: true }).click()
    await expect(page.getByText(f.notFollowed)).toBeVisible()
    expect(app.calls.find((c) => c.name === 'submit_followthrough')?.body).toEqual({ p_date: TODAY, p_answer: 'no', p_channel: 'push' })
  })

  test('the card records what it showed (D61)', async ({ page }) => {
    const app = await openApp(page, { at: '2026-09-29T06:50:00-05:00', tables: day })
    await expect.poll(() => app.calls.find((c) => c.name === 'record_shown')?.body).toEqual({ p_date: TODAY })
  })
})

test.describe('the next morning (R55, D67, D68)', () => {
  const nextMorning = { daily_status: [], uploads: [], shown_status: shownEaseOff }

  test("asks about yesterday first, then today's check-in, then shows the card", async ({ page }) => {
    const app = await openApp(page, { at: '2026-09-30T07:00:00-05:00', tables: nextMorning })
    await expect(page.getByText(f.yesterdayLabel)).toBeVisible()
    await expect(page.getByText('Train easy today')).toBeVisible()
    await expect(page.getByRole('heading', { name: wording.checkin.question })).toHaveCount(0)
    await page.getByRole('button', { name: f.yes, exact: true }).click()
    expect(app.calls.find((c) => c.name === 'submit_followthrough')?.body).toEqual({ p_date: TODAY, p_answer: 'yes', p_channel: 'next_morning' })
    await expect(page.getByRole('heading', { name: wording.checkin.question })).toBeVisible()
    await page.getByRole('button', { name: wording.checkin.skip }).click()
    await expect(page.getByRole('heading', { name: wording.states.waiting.headline })).toBeVisible()
  })

  test('can be put off, and is not asked from noon', async ({ page }) => {
    await openApp(page, { at: '2026-09-30T07:00:00-05:00', tables: { ...nextMorning, checkins: [{ answer: 'good' }] } })
    await page.getByRole('button', { name: f.notNow }).click()
    await expect(page.getByText(f.yesterdayLabel)).toHaveCount(0)
    await page.goto('about:blank')
    await openApp(page, { at: '2026-09-30T12:00:00-05:00', tables: { ...nextMorning, checkins: [{ answer: 'good' }] } })
    await expect(page.getByRole('heading', { name: wording.states.noSync.headline })).toBeVisible()
    await expect(page.getByText(f.yesterdayLabel)).toHaveCount(0)
  })

  test('is not asked when yesterday was already answered', async ({ page }) => {
    await openApp(page, {
      at: '2026-09-30T07:00:00-05:00',
      tables: { ...nextMorning, checkins: [{ answer: 'good' }], followthrough: [{ date: TODAY, answer: 'no', answered_at: '2026-09-30T01:10:00Z' }] },
    })
    await expect(page.getByRole('heading', { name: wording.states.waiting.headline })).toBeVisible()
    await expect(page.getByText(f.yesterdayLabel)).toHaveCount(0)
  })
})

test('says when the last notification did not arrive (R34)', async ({ page }) => {
  await openApp(page, { at: '2026-09-29T06:50:00-05:00', tables: { ...day, notifications: [{ kind: 'morning', status: 'failed' }] } })
  await expect(page.getByRole('heading', { name: wording.notificationHealth.failingHeadline })).toBeVisible()
  await page.getByRole('link', { name: wording.notificationHealth.settings }).click()
  await expect(page.getByRole('heading', { name: wording.day.settings })).toBeVisible()
})
