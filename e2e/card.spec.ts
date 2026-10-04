import { expect, test } from '@playwright/test'
import { wording } from '../supabase/functions/_shared/wording'
import { notCounted, sampleDay } from '../src/lib/sample-days'
import { dailySync, openApp, TZ } from './fixtures/mock-app'

// The service worker would take requests past the made-up answers.
test.use({ timezoneId: TZ, serviceWorkers: 'block' })

// The design's sample day: Tuesday 29 September at 6:50am, synced at 6:42am.
const MORNING = '2026-09-29T06:50:00-05:00'
const statusRow = { ...sampleDay, date: '2026-09-29', no_status_reason: null, settings_version: 2 }
const sampleTables = { daily_status: [statusRow], uploads: [dailySync('2026-09-29T06:42:00-05:00')] }

test.describe('the readiness card on an iPhone', () => {
  test('asks how you feel before showing the status (R16)', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: sampleTables })
    await expect(page.getByRole('heading', { name: wording.checkin.question })).toBeVisible()
    await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toHaveCount(0)
  })

  test('shows the sample day as designed after the check-in', async ({ page }) => {
    const app = await openApp(page, { at: MORNING, tables: sampleTables })
    await page.getByRole('button', { name: wording.checkin.answers.okay }).click()

    await expect(page.getByText('Tuesday 29 September')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible()
    await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
    await expect(page.getByText('Updated from your Watch at 6:42am')).toBeVisible()
    await expect(page.getByRole('heading', { name: "A short night, and your body hasn't fully recovered" })).toBeVisible()
    await expect(page.getByText('Train easy today')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Why ease off today' })).toBeVisible()
    await expect(page.locator('.list-row')).toContainText('You said you feel okay today')

    // The answer was saved for today, before the status was seen (R18).
    expect(app.calls.find((c) => c.name === 'submit_checkin')?.body).toEqual({ p_date: '2026-09-29', p_answer: 'okay', p_status_seen: false })
    // The card view was logged without any health value (R43).
    await expect.poll(() => app.calls.find((c) => c.name === 'log_usage')?.body).toEqual({
      p_event: 'card_view',
      p_meta: { date: '2026-09-29', status_shown: true, state: 'status' },
    })
  })

  test('shows the card at once after Skip, with a prompt to answer later (R17)', async ({ page }) => {
    const app = await openApp(page, { at: MORNING, tables: sampleTables })
    await page.getByRole('button', { name: wording.checkin.skip }).click()
    await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
    await expect(page.locator('.list-row')).toContainText(wording.checkin.question)
    expect(app.calls.find((c) => c.name === 'log_usage')?.body).toEqual({ p_event: 'checkin_skipped', p_meta: { date: '2026-09-29' } })

    // Answering later records that the status had already been seen.
    await page.getByRole('button', { name: wording.checkin.answer }).click()
    await page.getByRole('button', { name: wording.checkin.answers.off }).click()
    await expect(page.locator('.list-row')).toContainText('You said you feel off today')
    expect(app.calls.find((c) => c.name === 'submit_checkin')?.body).toEqual({ p_date: '2026-09-29', p_answer: 'off', p_status_seen: true })
  })

  test('says "Based on 2 of 3 readings" when one is missing (R30)', async ({ page }) => {
    const partial = { ...statusRow, status: 'ready', nudge: 'train_as_planned', readings_used: 2, points: { ...sampleDay.points, hrv: notCounted('missing') } }
    await openApp(page, { at: MORNING, tables: { ...sampleTables, daily_status: [partial], checkins: [{ answer: 'good' }] } })
    await expect(page.getByText(wording.card.partial)).toBeVisible()
    await expect(page.getByText(wording.card.status.ready, { exact: true })).toBeVisible()
  })
})

test.describe('cards without a status', () => {
  const answered = { checkins: [{ answer: 'good' }] }

  test("waits for this morning's sync, never showing yesterday's status (R25)", async ({ page }) => {
    await openApp(page, { at: MORNING, tables: { ...answered, uploads: [dailySync('2026-09-28T06:51:00-05:00')] } })
    await expect(page.getByRole('heading', { name: wording.states.waiting.headline })).toBeVisible()
    await expect(page.getByText('Your last sync was yesterday at 6:51am.')).toBeVisible()
  })

  test('says how to sync by hand after 11:30 (R27), and that there is no status after noon (R29)', async ({ page }) => {
    await openApp(page, { at: '2026-09-29T11:40:00-05:00', tables: answered })
    await expect(page.getByRole('heading', { name: wording.states.missed.headline })).toBeVisible()
    await expect(page.getByText(wording.states.missed.detail)).toBeVisible()
  })

  test('marks a sync between 11:30 and noon as late (R28)', async ({ page }) => {
    await openApp(page, { at: '2026-09-29T11:50:00-05:00', tables: { ...answered, daily_status: [statusRow], uploads: [dailySync('2026-09-29T11:45:00-05:00')] } })
    await expect(page.getByText(wording.card.late, { exact: true })).toBeVisible()
    await expect(page.getByText(wording.card.status.ease_off, { exact: true })).toBeVisible()
  })

  test('shows learning progress and last night in plain words (R32)', async ({ page }) => {
    const learning = { ...statusRow, status: 'none', no_status_reason: 'learning', nudge: null, total: null, readings_used: 0, points: {} }
    await openApp(page, {
      at: MORNING,
      tables: {
        ...answered,
        daily_status: [learning],
        uploads: [dailySync('2026-09-29T06:42:00-05:00')],
        baselines: [
          { metric: 'hrv', valid_nights: 14, building: true },
          { metric: 'sleep', valid_nights: 14, building: true },
        ],
        nights: [{ asleep_min: 370, hrv_median: 42, sleeping_hr: 55 }],
        'rpc/status_zones': [{ readings: { hrv: { min_valid_nights: 21 }, sleep: { min_valid_nights: 21 }, sleeping_hr: { min_valid_nights: 21 } } }],
      },
    })
    await expect(page.getByText(wording.states.learning.progress(14, 21))).toBeVisible()
    await expect(page.getByText('Last night you slept 6h 10m')).toBeVisible()
    await expect(page.locator('.pill-ready, .pill-ease_off, .pill-rest')).toHaveCount(0)
  })

  test('says sync is being rejected, with the way to Settings (R11)', async ({ page }) => {
    const refused = { received_at: '2026-09-29T11:40:00.000Z', kind: null, status: 'rejected', error: 'token_revoked', local_date: null, night_complete: false }
    await openApp(page, { at: MORNING, tables: { ...answered, uploads: [refused, dailySync('2026-09-28T06:51:00-05:00')] } })
    await expect(page.getByRole('heading', { name: wording.states.rejected.headline })).toBeVisible()
    await page.getByRole('link', { name: wording.states.rejected.settings }).click()
    await expect(page.getByRole('heading', { name: wording.day.settings })).toBeVisible()
    await page.getByRole('button', { name: wording.why.back }).click()
    await expect(page.getByRole('heading', { name: wording.states.rejected.headline })).toBeVisible()
  })

  test('shows import progress while the year is still arriving (R12)', async ({ page }) => {
    const months = ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05'].map((month_id) => ({ month_id, local_date: '2026-09-28' }))
    await openApp(page, { at: MORNING, tables: { ...answered, 'uploads:months': months } })
    await expect(page.getByText(wording.sync.importProgress(5))).toBeVisible()
  })
})

// R23: the morning card fits one screen on a 390-point iPhone, leaving room
// for the status bar and home indicator (390 by 763 points).
test.describe('one screen in the morning', () => {
  test.use({ viewport: { width: 390, height: 763 } })

  const longest = {
    ...statusRow,
    status: 'ready',
    nudge: 'train_as_planned',
    readings_used: 2,
    points: { ...sampleDay.points, hrv: notCounted('missing') },
  }

  for (const [name, row, sync] of [
    ['the sample day', statusRow, '2026-09-29T06:42:00-05:00'],
    ['a long briefing from 2 of 3 readings, synced late', longest, '2026-09-29T11:45:00-05:00'],
  ] as const) {
    test(`fits without scrolling: ${name}`, async ({ page }) => {
      await openApp(page, { at: '2026-09-29T11:55:00-05:00', tables: { daily_status: [row], uploads: [dailySync(sync)], checkins: [{ answer: 'okay' }] } })
      await expect(page.locator('.list-row')).toBeVisible()
      const overflow = await page.evaluate(() => ({
        down: document.documentElement.scrollHeight - window.innerHeight,
        across: document.documentElement.scrollWidth - window.innerWidth,
      }))
      expect(overflow.down).toBeLessThanOrEqual(0)
      expect(overflow.across).toBeLessThanOrEqual(0)
    })
  }

  test('has tap targets of at least 44 points', async ({ page }) => {
    await openApp(page, { at: MORNING, tables: sampleTables })
    for (const name of [wording.checkin.answers.good, wording.checkin.answers.okay, wording.checkin.answers.off]) {
      expect((await page.getByRole('button', { name }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48)
    }
    await page.getByRole('button', { name: wording.checkin.answers.good }).click()
    for (const el of [
      page.getByRole('button', { name: wording.day.settings }),
      page.getByRole('link', { name: 'Why ease off today' }),
      page.getByRole('button', { name: wording.checkin.change }),
    ]) {
      expect((await el.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  })
})
