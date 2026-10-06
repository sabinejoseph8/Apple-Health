// Which readiness card to show (R25 to R32), and the notices that sit on it
// (R11, R12). Pure: it takes what was read from the database and the phone's
// clock, so every situation can be tested without a database.

import type { DayWords, Nudge, Reading } from '../../supabase/functions/_shared/briefing.ts'
import { minutesOfDay } from './when'

export interface StatusRow extends DayWords {
  date: string
  no_status_reason: 'waiting' | 'night_unfinished' | 'no_sync' | 'not_enough_data' | 'learning' | null
  nudge: Nudge | null
  total: number | null
  settings_version: number
}

export interface UploadRow {
  received_at: string
  kind: 'daily' | 'backfill' | 'ping' | null
  status: 'accepted' | 'rejected'
  error: string | null
  local_date: string | null
  night_complete: boolean
}

export interface BaselineRow {
  metric: string
  valid_nights: number
  building: boolean
}

export interface NightRow {
  asleep_min: number
  hrv_median: number | null
  sleeping_hr: number | null
}

export interface CardInputs {
  now: Date
  // The phone's local date, "2026-09-29".
  today: string
  // daily_status for today, if the analysis has written it.
  status: StatusRow | null
  // Uploads from the last few days, newest first, of every kind.
  recentUploads: UploadRow[]
  // The newest accepted daily or import post, however old.
  lastSync: UploadRow | null
  // Today's normals and night, for "Learning your usual levels" (R32).
  baselines: BaselineRow[]
  night: NightRow | null
  // How many valid nights each reading's normal needs (status_zones).
  minValidNights: Partial<Record<Reading, number>>
  // Months of the one-year import that have arrived, while under 12 (R12).
  importMonths: number | null
}

export type CardState =
  | { kind: 'status'; row: StatusRow; syncedAt: Date | null; late: boolean }
  | { kind: 'waiting'; lastSync: Date | null }
  // delayed: the readings arrived a while ago and there is still no status.
  | { kind: 'analysing'; delayed: boolean }
  | { kind: 'night_unfinished' }
  | { kind: 'missed' }
  | { kind: 'no_sync'; afterNoon: boolean }
  | { kind: 'not_enough_data'; why: 'no_sleep' | 'too_few' | 'unfinished' }
  | { kind: 'learning'; nights: number; needed: number; night: NightRow | null }

export type CardKind = CardState['kind']

export interface CardModel {
  state: CardState
  rejected: 'token' | 'other' | null
  importMonths: number | null
}

// A sync after 11:30am is late (R28); after noon there is no status (R29).
export const LATE_FROM = 11 * 60 + 30
export const NOON = 12 * 60
// The status usually follows a sync within a minute or two.
export const ANALYSING_FOR_MS = 15 * 60 * 1000
const SCORE_READINGS: Reading[] = ['hrv', 'sleep', 'sleeping_hr']
const DEFAULT_MIN_VALID = 21

const time = (u: UploadRow) => new Date(u.received_at)
const newestFirst = (a: UploadRow, b: UploadRow) => b.received_at.localeCompare(a.received_at)

export function selectCard(i: CardInputs): CardModel {
  return { state: selectState(i), rejected: selectRejected(i), importMonths: i.importMonths }
}

function selectState(i: CardInputs): CardState {
  // This morning's accepted syncs, oldest first. The time shown is the sync
  // that completed last night, or else the latest one.
  const todays = i.recentUploads
    .filter((u) => u.kind === 'daily' && u.status === 'accepted' && u.local_date === i.today)
    .sort((a, b) => a.received_at.localeCompare(b.received_at))
  const first = todays.length > 0 ? time(todays[0]) : null
  const completing = todays.find((u) => u.night_complete)
  const synced = completing ? time(completing) : todays.length > 0 ? time(todays[todays.length - 1]) : null
  const nowMin = minutesOfDay(i.now)
  const firstAfterNoon = first !== null && minutesOfDay(first) >= NOON

  const row = i.status
  if (row && row.status !== 'none') {
    if (synced && minutesOfDay(synced) >= NOON) {
      // Last night only arrived after noon: no status today (R29).
      return firstAfterNoon ? { kind: 'no_sync', afterNoon: true } : { kind: 'not_enough_data', why: 'unfinished' }
    }
    return {
      kind: 'status',
      row,
      syncedAt: synced ?? (i.lastSync ? time(i.lastSync) : null),
      late: synced !== null && minutesOfDay(synced) >= LATE_FROM,
    }
  }

  if (row) {
    if (firstAfterNoon) return { kind: 'no_sync', afterNoon: true }
    switch (row.no_status_reason) {
      case 'night_unfinished':
        // Sleep still in progress until noon (R26), then not enough data (R31).
        return nowMin < NOON ? { kind: 'night_unfinished' } : { kind: 'not_enough_data', why: 'unfinished' }
      case 'learning':
        return learning(i)
      case 'not_enough_data':
        return { kind: 'not_enough_data', why: i.night ? 'too_few' : 'no_sleep' }
      default:
        return { kind: 'not_enough_data', why: 'too_few' }
    }
  }

  // No status row yet.
  if (first) {
    if (firstAfterNoon) return { kind: 'no_sync', afterNoon: true }
    return { kind: 'analysing', delayed: i.now.getTime() - first.getTime() > ANALYSING_FOR_MS }
  }
  if (nowMin < LATE_FROM) return { kind: 'waiting', lastSync: i.lastSync ? time(i.lastSync) : null }
  if (nowMin < NOON) return { kind: 'missed' }
  return { kind: 'no_sync', afterNoon: false }
}

// "14 of 21 nights": the building reading closest to done, since a status
// returns as soon as only one reading is still building (D36).
function learning(i: CardInputs): CardState {
  const building = i.baselines.filter((b) => b.building && SCORE_READINGS.includes(b.metric as Reading))
  const closest = [...building].sort((a, b) => b.valid_nights - a.valid_nights)[0]
  const needed = closest ? (i.minValidNights[closest.metric as Reading] ?? DEFAULT_MIN_VALID) : DEFAULT_MIN_VALID
  return { kind: 'learning', nights: closest?.valid_nights ?? 0, needed, night: i.night }
}

// The Shortcut's last post was refused and nothing has been accepted since (R11).
function selectRejected(i: CardInputs): CardModel['rejected'] {
  const rejected = i.recentUploads.filter((u) => u.status === 'rejected').sort(newestFirst)[0]
  if (!rejected) return null
  const accepted = [...i.recentUploads.filter((u) => u.status === 'accepted'), ...(i.lastSync ? [i.lastSync] : [])].sort(newestFirst)[0]
  if (accepted && accepted.received_at > rejected.received_at) return null
  return rejected.error === 'token_revoked' ? 'token' : 'other'
}

// Months of the one-year import that have fully arrived, counted the way the
// server counts them (this month and the 11 before, by the phone's date of
// the latest import post). Null when there was no import or it is complete.
export function importMonthsFrom(rows: { month_id: string; local_date: string }[]): number | null {
  if (rows.length === 0) return null
  const latest = rows.map((r) => r.local_date).sort().at(-1)!
  const [y, m] = latest.split('-').map(Number)
  const last = y * 12 + (m - 1)
  const months = new Set(
    rows
      .map((r) => r.month_id)
      .filter((id) => {
        const [iy, im] = id.split('-').map(Number)
        const n = iy * 12 + (im - 1)
        return n <= last && n > last - 12
      }),
  )
  return months.size >= 12 ? null : months.size
}
