import { describe, expect, it } from 'vitest'
import { type CardInputs, importMonthsFrom, selectCard, type StatusRow, type UploadRow } from './card-state'
import { sampleDay } from './sample-days'

// Times are built in the test machine's own time zone, like the phone's.
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m)
const upload = (d: Date, extra: Partial<UploadRow> = {}): UploadRow => ({
  received_at: d.toISOString(),
  kind: 'daily',
  status: 'accepted',
  error: null,
  local_date: `2026-09-${String(d.getDate()).padStart(2, '0')}`,
  night_complete: true,
  ...extra,
})
const statusRow = (extra: Partial<StatusRow> = {}): StatusRow => ({
  ...sampleDay,
  date: '2026-09-29',
  no_status_reason: null,
  settings_version: 2,
  ...extra,
})
const noStatus = (reason: StatusRow['no_status_reason']): StatusRow =>
  statusRow({ status: 'none', no_status_reason: reason, nudge: null, total: null, readings_used: 0 })

function inputs(extra: Partial<CardInputs>): CardInputs {
  return {
    now: at(6, 50),
    today: '2026-09-29',
    status: null,
    recentUploads: [],
    lastSync: null,
    baselines: [],
    night: null,
    minValidNights: { hrv: 21, sleep: 21, sleeping_hr: 21 },
    importMonths: null,
    ...extra,
  }
}

describe('which card shows (R25 to R32)', () => {
  it('waits for the sync, with the last sync time, before 11:30 (R25)', () => {
    const yesterday = upload(at(6, 51, 28))
    const { state } = selectCard(inputs({ recentUploads: [yesterday], lastSync: yesterday }))
    expect(state).toEqual({ kind: 'waiting', lastSync: at(6, 51, 28) })
  })

  it("never shows yesterday's status as today's (R25)", () => {
    const { state } = selectCard(inputs({ status: null, lastSync: upload(at(6, 51, 28)) }))
    expect(state.kind).toBe('waiting')
  })

  it('says the readings are in while the status is being worked out', () => {
    expect(selectCard(inputs({ recentUploads: [upload(at(6, 42))] })).state.kind).toBe('analysing')
  })

  it("shows today's status with the time of the sync that completed the night", () => {
    const early = upload(at(5, 10), { night_complete: false })
    const done = upload(at(6, 42))
    const { state } = selectCard(inputs({ status: statusRow(), recentUploads: [done, early] }))
    expect(state).toMatchObject({ kind: 'status', syncedAt: at(6, 42), late: false })
  })

  it('marks a sync between 11:30 and noon as late (R28)', () => {
    const { state } = selectCard(inputs({ now: at(11, 50), status: statusRow(), recentUploads: [upload(at(11, 45))] }))
    expect(state).toMatchObject({ kind: 'status', late: true })
  })

  it('gives no status when the first sync came after noon (R29)', () => {
    const { state } = selectCard(inputs({ now: at(12, 40), status: statusRow(), recentUploads: [upload(at(12, 30))] }))
    expect(state).toEqual({ kind: 'no_sync', afterNoon: true })
  })

  it("gives no status when last night only arrived after noon (R26, R31)", () => {
    const morning = upload(at(9, 0), { night_complete: false })
    const later = upload(at(12, 30))
    const { state } = selectCard(inputs({ now: at(12, 40), status: statusRow(), recentUploads: [later, morning] }))
    expect(state).toEqual({ kind: 'not_enough_data', why: 'unfinished' })
  })

  it('says sleep is still in progress before noon, and not enough data after (R26)', () => {
    const sync = upload(at(6, 42), { night_complete: false })
    const status = noStatus('night_unfinished')
    expect(selectCard(inputs({ status, recentUploads: [sync] })).state.kind).toBe('night_unfinished')
    expect(selectCard(inputs({ now: at(12, 5), status, recentUploads: [sync] })).state).toEqual({
      kind: 'not_enough_data',
      why: 'unfinished',
    })
  })

  it('says no sync yet from 11:30 (R27), and no sync by noon after (R29)', () => {
    expect(selectCard(inputs({ now: at(11, 30) })).state.kind).toBe('missed')
    expect(selectCard(inputs({ now: at(12, 0) })).state).toEqual({ kind: 'no_sync', afterNoon: false })
  })

  it('says why there is not enough data (R31)', () => {
    const sync = [upload(at(6, 42))]
    const status = noStatus('not_enough_data')
    expect(selectCard(inputs({ status, recentUploads: sync })).state).toEqual({ kind: 'not_enough_data', why: 'no_sleep' })
    const night = { asleep_min: 400, hrv_median: null, sleeping_hr: null }
    expect(selectCard(inputs({ status, recentUploads: sync, night })).state).toEqual({ kind: 'not_enough_data', why: 'too_few' })
  })

  it('shows learning progress from the building reading closest to done (R32)', () => {
    const baselines = [
      { metric: 'hrv', valid_nights: 14, building: true },
      { metric: 'sleep', valid_nights: 19, building: true },
      { metric: 'sleeping_hr', valid_nights: 30, building: false },
      { metric: 'resp_rate', valid_nights: 20, building: true },
    ]
    const night = { asleep_min: 370, hrv_median: 42, sleeping_hr: 55 }
    const { state } = selectCard(inputs({ status: noStatus('learning'), recentUploads: [upload(at(6, 42))], baselines, night }))
    expect(state).toEqual({ kind: 'learning', nights: 19, needed: 21, night })
  })
})

describe('notices on the card', () => {
  it('says sync is being rejected after a replaced token (R11)', () => {
    const ok = upload(at(6, 42, 28))
    const refused = upload(at(6, 40), { status: 'rejected', kind: null, error: 'token_revoked', local_date: null })
    expect(selectCard(inputs({ recentUploads: [refused, ok], lastSync: ok })).rejected).toBe('token')
  })

  it('says so for other refusals too', () => {
    const refused = upload(at(6, 40), { status: 'rejected', kind: null, error: 'bad body', local_date: null })
    expect(selectCard(inputs({ recentUploads: [refused] })).rejected).toBe('other')
  })

  it('clears once a sync is accepted again', () => {
    const refused = upload(at(6, 40), { status: 'rejected', kind: null, error: 'token_revoked', local_date: null })
    const ok = upload(at(6, 55))
    expect(selectCard(inputs({ recentUploads: [ok, refused] })).rejected).toBeNull()
  })

  it('counts imported months the way the server does (R12)', () => {
    const rows = ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2025-09'].map((month_id) => ({ month_id, local_date: '2026-09-29' }))
    expect(importMonthsFrom(rows)).toBe(5)
    const year = Array.from({ length: 12 }, (_, k) => ({ month_id: `${k < 9 ? 2026 : 2025}-${String(((8 - k + 12) % 12) + 1).padStart(2, '0')}`, local_date: '2026-09-29' }))
    expect(importMonthsFrom(year)).toBeNull()
    expect(importMonthsFrom([])).toBeNull()
  })
})
