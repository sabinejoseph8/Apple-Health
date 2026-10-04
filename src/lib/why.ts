// What Why today needs beyond the card (R35 to R43): four weeks of nights for
// the charts, today's normals, "Also checked" and the zone numbers. The
// helpers that turn readings into the numbers panel's words are pure, so they
// are tested on their own.

import { formatDuration, type IllnessCheck, type Reading, type Verdict } from '../../supabase/functions/_shared/briefing.ts'
import { wording } from '../../supabase/functions/_shared/wording'
import { supabase } from './supabase'

const n = wording.why.numbers
const u = wording.why.units

export interface NightPoint {
  date: string
  value: number | null
}

export interface Normal {
  median: number | null
  low: number | null
  high: number | null
  validNights: number
  building: boolean
}

export interface Zones {
  version: number
  ease_off_at: number
  rest_at: number
  window_nights: number
  min_valid_nights: number
  reading_order: Reading[]
  readings: Record<Reading, { window_nights: number; min_valid_nights: number }>
}

export interface WhyData {
  // Four weeks of nights per reading, oldest first, with gaps as null.
  nights: Record<Reading, NightPoint[]>
  normals: Partial<Record<Reading, Normal>>
  breathing: { value: number | null; verdict: Verdict | null }
  resting: { value: number | null; verdict: Verdict | null }
  illness: IllnessCheck
  zones: Zones | null
}

const NIGHT_COLUMN: Record<Reading, string> = { hrv: 'hrv_median', sleep: 'asleep_min', sleeping_hr: 'sleeping_hr' }
export const CHART_NIGHTS = 28

// The 28 dates ending with today, oldest first.
export function chartDates(today: string): string[] {
  const end = new Date(`${today}T12:00:00Z`)
  return Array.from({ length: CHART_NIGHTS }, (_, k) => {
    const d = new Date(end)
    d.setUTCDate(end.getUTCDate() - (CHART_NIGHTS - 1 - k))
    return d.toISOString().slice(0, 10)
  })
}

function must<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error
  return result.data
}

export async function loadWhy(today: string, settingsVersion: number): Promise<WhyData> {
  const dates = chartDates(today)
  const [nights, baselines, insights, zones] = await Promise.all([
    supabase.from('nights').select('night_date, asleep_min, hrv_median, sleeping_hr').gte('night_date', dates[0]).lte('night_date', today),
    supabase.from('baselines').select('metric, median_28, range_low, range_high, valid_nights, building').eq('night_date', today),
    supabase.from('insights').select('module, metric, value, severity').eq('date', today).in('module', ['also_checked', 'illness_check']),
    supabase.rpc('status_zones', { p_version: settingsVersion }).maybeSingle(),
  ])

  const byDate = new Map((must(nights) as Record<string, number | string | null>[]).map((r) => [r.night_date as string, r]))
  const series = (r: Reading): NightPoint[] =>
    dates.map((date) => {
      const v = byDate.get(date)?.[NIGHT_COLUMN[r]]
      return { date, value: v === null || v === undefined ? null : Number(v) }
    })

  const normals: Partial<Record<Reading, Normal>> = {}
  for (const b of must(baselines) as { metric: string; median_28: number | null; range_low: number | null; range_high: number | null; valid_nights: number; building: boolean }[]) {
    if (b.metric in NIGHT_COLUMN) {
      normals[b.metric as Reading] = { median: b.median_28, low: b.range_low, high: b.range_high, validNights: b.valid_nights, building: b.building }
    }
  }

  const rows = must(insights) as { module: string; metric: string; value: number | null; severity: string }[]
  const also = (metric: string) => {
    const row = rows.find((r) => r.module === 'also_checked' && r.metric === metric)
    return { value: row?.value ?? null, verdict: (row?.severity as Verdict | undefined) ?? null }
  }
  const pattern = rows.find((r) => r.module === 'illness_check')?.severity

  return {
    nights: { hrv: series('hrv'), sleep: series('sleep'), sleeping_hr: series('sleeping_hr') },
    normals,
    breathing: also('resp_rate'),
    resting: also('resting_hr'),
    illness: pattern === 'fired' || pattern === 'clear' ? pattern : 'not_run',
    zones: must(zones) as Zones | null,
  }
}

// "38" with "ms", or "5 hr 52 min" as two numbers and two units.
export function bigValue(r: Reading, v: number): { number: string; unit: string }[] {
  if (r === 'sleep') {
    const total = Math.round(v)
    return [
      { number: String(Math.floor(total / 60)), unit: u.hours },
      { number: String(total % 60), unit: u.minutes },
    ]
  }
  return [{ number: String(Math.round(v)), unit: u[r] }]
}

// "52 ms", "7h 10m", "50 bpm".
export function shortValue(r: Reading, v: number): string {
  return r === 'sleep' ? formatDuration(v) : `${Math.round(v)} ${u[r]}`
}

// "40 to 64 ms", "6h 02m to 8h 18m".
export function rangeText(r: Reading, low: number, high: number): string {
  return r === 'sleep' ? n.rangeValue(formatDuration(low), formatDuration(high), '') : n.rangeValue(String(Math.round(low)), String(Math.round(high)), u[r])
}

// "14 ms lower", "1h 18m less", "The same as normal".
export function vsNormalText(r: Reading, value: number, normal: number): string {
  const diff = Math.round(value) - Math.round(normal)
  if (diff === 0) return n.same
  const size = r === 'sleep' ? formatDuration(Math.abs(diff)) : `${Math.abs(diff)} ${u[r]}`
  if (r === 'sleep') return diff < 0 ? n.less(size) : n.more(size)
  return diff < 0 ? n.lower(size) : n.higher(size)
}

// How last night compares with the other nights of the last four weeks.
export function fourWeeksText(nights: NightPoint[], last: number): string | null {
  const others = nights.slice(0, -1).map((p) => p.value).filter((v): v is number => v !== null)
  if (others.length === 0) return null
  if (others.every((v) => v > last)) return n.lowest
  if (others.every((v) => v < last)) return n.highest
  const higher = others.filter((v) => v > last).length
  const lower = others.filter((v) => v < last).length
  return higher >= lower ? n.lowerThan(higher, others.length) : n.higherThan(lower, others.length)
}

// "1.2", "2.4", "1".
export function zoneNumber(v: number): string {
  return String(Math.round(v * 10) / 10)
}
