// The trend view's data (R44 to R46, D70): eight weeks of nights per score
// reading, each with the normal it had that night.

import type { Reading } from '../../supabase/functions/_shared/briefing.ts'
import { must, supabase } from './supabase'

export const TREND_NIGHTS = 56

export interface TrendPoint {
  date: string
  value: number | null
  // That night's normal and range (D70); null while it was being learned.
  median: number | null
  low: number | null
  high: number | null
  building: boolean
  validNights: number
}

export interface TrendData {
  series: Record<Reading, TrendPoint[]>
  minValid: Partial<Record<Reading, number>>
}

const COLUMN: Record<Reading, string> = { hrv: 'hrv_median', sleep: 'asleep_min', sleeping_hr: 'sleeping_hr' }

// The 56 dates ending with today, oldest first.
export function trendDates(today: string): string[] {
  const end = new Date(`${today}T12:00:00Z`)
  return Array.from({ length: TREND_NIGHTS }, (_, k) => {
    const d = new Date(end)
    d.setUTCDate(end.getUTCDate() - (TREND_NIGHTS - 1 - k))
    return d.toISOString().slice(0, 10)
  })
}

// A night is flagged when its value was outside that night's range.
export function flagged(p: TrendPoint): boolean {
  return p.value !== null && !p.building && p.low !== null && p.high !== null && (p.value < p.low || p.value > p.high)
}

export async function loadTrends(today: string): Promise<TrendData> {
  const dates = trendDates(today)
  const [nights, baselines, zones] = await Promise.all([
    supabase.from('nights').select('night_date, asleep_min, hrv_median, sleeping_hr').gte('night_date', dates[0]).lte('night_date', today),
    supabase
      .from('baselines')
      .select('night_date, metric, median_28, range_low, range_high, building, valid_nights')
      .in('metric', ['hrv', 'sleep', 'sleeping_hr'])
      .gte('night_date', dates[0])
      .lte('night_date', today),
    supabase.rpc('status_zones').maybeSingle(),
  ])
  const nightRows = new Map((must(nights) as Record<string, string | number | null>[]).map((n) => [n.night_date as string, n]))
  const normals = new Map(
    (must(baselines) as { night_date: string; metric: string; median_28: number | null; range_low: number | null; range_high: number | null; building: boolean; valid_nights: number }[]).map(
      (b) => [`${b.metric}:${b.night_date}`, b],
    ),
  )
  const series = (r: Reading): TrendPoint[] =>
    dates.map((date) => {
      const v = nightRows.get(date)?.[COLUMN[r]]
      const b = normals.get(`${r}:${date}`)
      return {
        date,
        value: v === null || v === undefined ? null : Number(v),
        median: b && !b.building ? b.median_28 : null,
        low: b && !b.building ? b.range_low : null,
        high: b && !b.building ? b.range_high : null,
        building: b?.building ?? true,
        validNights: b?.valid_nights ?? 0,
      }
    })
  const z = must(zones) as { readings?: Record<Reading, { min_valid_nights: number }> } | null
  const minValid: Partial<Record<Reading, number>> = {}
  for (const [r, v] of Object.entries(z?.readings ?? {})) minValid[r as Reading] = v.min_valid_nights
  return { series: { hrv: series('hrv'), sleep: series('sleep'), sleeping_hr: series('sleeping_hr') }, minValid }
}
