// Reads what the readiness card needs for today. Row-level security means
// every query only ever returns the signed-in user's own rows.

import type { Reading } from '../../supabase/functions/_shared/briefing.ts'
import { type BaselineRow, type CardInputs, importMonthsFrom, type NightRow, type StatusRow, type UploadRow } from './card-state'
import { must, supabase } from './supabase'
import { localDate } from './when'

export type CheckinAnswer = 'good' | 'okay' | 'off'

export interface TodayData {
  inputs: CardInputs
  // Today's latest check-in answer, and whether today's check-in was skipped.
  checkin: CheckinAnswer | null
  skipped: boolean
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
  const [inputs, backfill, baselines, night, checkin, skipped] = await Promise.all([
    loadStatusInputs(now),
    supabase.from('uploads').select('month_id, local_date').eq('kind', 'backfill').eq('status', 'accepted').eq('month_complete', true),
    supabase.from('baselines').select('metric, valid_nights, building').eq('night_date', today),
    supabase.from('nights').select('asleep_min, hrv_median, sleeping_hr').eq('night_date', today).maybeSingle(),
    supabase.from('checkins').select('answer').eq('date', today).order('answered_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('usage_events').select('id').eq('event', 'checkin_skipped').eq('meta->>date', today).limit(1),
  ])

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
  }
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
