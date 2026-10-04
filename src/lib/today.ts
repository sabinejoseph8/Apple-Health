// Reads what the readiness card needs for today. Row-level security means
// every query only ever returns the signed-in user's own rows.

import type { Nudge, Reading } from '../../supabase/functions/_shared/briefing.ts'
import { type BaselineRow, type CardInputs, importMonthsFrom, type NightRow, type StatusRow, type UploadRow } from './card-state'
import { type FollowAnswer, type FollowDay, followDays } from './follow'
import { must, supabase } from './supabase'
import { localDate } from './when'

export type CheckinAnswer = 'good' | 'okay' | 'off'

export interface TodayData {
  inputs: CardInputs
  // Today's latest check-in answer, and whether today's check-in was skipped.
  checkin: CheckinAnswer | null
  skipped: boolean
  // Today's and yesterday's change days as shown, with their answers (R52 to
  // R55), and whether anything has been shown today at all (D61).
  follow: { today: FollowDay | null; yesterday: FollowDay | null; shownToday: boolean }
  // How the latest notification of the last two days went (R34).
  lastNotification: { kind: string; status: string } | null
  // The latest weekly digest's week, for the card's digest row (R20, R57).
  latestDigest: { week_start: string; week_end: string } | null
}

const UPLOAD_COLUMNS = 'received_at, kind, status, error, local_date, night_complete'

// Enough to pick a card with a status and its sync time: today's status row,
// the last few days of uploads and the newest accepted sync. Why today needs
// only this; the card adds the rest below.
export async function loadStatusInputs(now: Date): Promise<CardInputs> {
  const today = localDate(now)
  const since = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const [status, recent, last] = await Promise.all([
    supabase.from('daily_status').select('*').eq('date', today).maybeSingle(),
    supabase.from('uploads').select(UPLOAD_COLUMNS).gte('received_at', since).order('received_at', { ascending: false }).limit(200),
    supabase
      .from('uploads')
      .select(UPLOAD_COLUMNS)
      .eq('status', 'accepted')
      .in('kind', ['daily', 'backfill'])
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  return {
    now,
    today,
    status: must(status) as StatusRow | null,
    recentUploads: must(recent) as UploadRow[],
    lastSync: must(last) as UploadRow | null,
    baselines: [],
    night: null,
    minValidNights: {},
    importMonths: null,
  }
}

export async function loadToday(now: Date = new Date()): Promise<TodayData> {
  const today = localDate(now)
  const yesterday = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const [inputs, backfill, baselines, night, checkin, skipped, shown, answers, notifications, digest] = await Promise.all([
    loadStatusInputs(now),
    supabase.from('uploads').select('month_id, local_date').eq('kind', 'backfill').eq('status', 'accepted').eq('month_complete', true),
    supabase.from('baselines').select('metric, valid_nights, building').eq('night_date', today),
    supabase.from('nights').select('asleep_min, hrv_median, sleeping_hr').eq('night_date', today).maybeSingle(),
    supabase.from('checkins').select('answer').eq('date', today).order('answered_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('usage_events').select('id').eq('event', 'checkin_skipped').eq('meta->>date', today).limit(1),
    supabase.from('shown_status').select('date, nudge, shown_at').in('date', [yesterday, today]),
    supabase.from('followthrough').select('date, answer, answered_at').in('date', [yesterday, today]),
    supabase.from('notifications').select('kind, status').gte('created_at', twoDaysAgo).order('created_at', { ascending: false }).limit(1),
    supabase.from('digests').select('week_start').order('week_start', { ascending: false }).limit(1).maybeSingle(),
  ])
  const digestWeek = (must(digest) as { week_start: string } | null)?.week_start
  const shownRows = must(shown) as { date: string; nudge: Nudge; shown_at: string }[]
  const follow = followDays(shownRows, must(answers) as { date: string; answer: FollowAnswer; answered_at: string }[])

  // The normals' minimum nights only matter while learning.
  const minValidNights: Partial<Record<Reading, number>> = {}
  if (inputs.status?.no_status_reason === 'learning') {
    const zones = must(await supabase.rpc('status_zones', { p_version: inputs.status.settings_version }).maybeSingle()) as {
      readings: Record<Reading, { min_valid_nights: number }>
    } | null
    for (const [r, v] of Object.entries(zones?.readings ?? {})) minValidNights[r as Reading] = v.min_valid_nights
  }

  return {
    inputs: {
      ...inputs,
      baselines: must(baselines) as BaselineRow[],
      night: must(night) as NightRow | null,
      minValidNights,
      importMonths: importMonthsFrom((must(backfill) ?? []) as { month_id: string; local_date: string }[]),
    },
    checkin: (must(checkin) as { answer: CheckinAnswer } | null)?.answer ?? null,
    skipped: (must(skipped) ?? []).length > 0,
    follow: { today: follow.get(today) ?? null, yesterday: follow.get(yesterday) ?? null, shownToday: shownRows.some((r) => r.date === today) },
    lastNotification: ((must(notifications) ?? []) as { kind: string; status: string }[])[0] ?? null,
    latestDigest: digestWeek ? { week_start: digestWeek, week_end: localDate(new Date(new Date(`${digestWeek}T12:00:00`).getTime() + 6 * 86400000)) } : null,
  }
}

export async function submitFollowThrough(date: string, answer: FollowAnswer, channel: 'push' | 'card' | 'next_morning'): Promise<void> {
  const { error } = await supabase.rpc('submit_followthrough', { p_date: date, p_answer: answer, p_channel: channel })
  if (error) throw error
}

// The card showing a status records what it showed (D61). The card doesn't
// wait for it; an answer does, as the server checks what was shown.
export async function recordShown(date: string): Promise<void> {
  const { error } = await supabase.rpc('record_shown', { p_date: date })
  if (error) throw error
}

// A notification's tap opens the app with "?n=<id>": record the tap (R51).
export function noteNotificationTap(id: number): void {
  supabase
    .rpc('log_notification_tap', { p_id: id })
    .then(
      () => undefined,
      () => undefined,
    )
}

export async function submitCheckin(today: string, answer: CheckinAnswer, statusSeen: boolean): Promise<void> {
  const { error } = await supabase.rpc('submit_checkin', { p_date: today, p_answer: answer, p_status_seen: statusSeen })
  if (error) throw error
}

// Logging never gets in the way: a failed log is simply dropped.
export function logUsage(event: 'card_view' | 'why_today_open' | 'checkin_skipped', meta: Record<string, string | boolean>): void {
  supabase
    .rpc('log_usage', { p_event: event, p_meta: meta })
    .then(
      () => undefined,
      () => undefined,
    )
}
