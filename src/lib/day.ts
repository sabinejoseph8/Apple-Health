// A past day's readings and status (D88): the same rows Why today reads, for
// any date, plus the first day Clarivi has, so "Previous day" knows where to stop.

import type { StatusRow } from './card-state'
import { must, supabase } from './supabase'
import { loadWhy, type WhyData } from './why'

export interface DayData {
  date: string
  row: StatusRow | null
  why: WhyData | null
  earliest: string | null
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function loadDay(date: string): Promise<DayData> {
  const [status, first] = await Promise.all([
    supabase.from('daily_status').select('*').eq('date', date).maybeSingle(),
    supabase.from('daily_status').select('date').order('date', { ascending: true }).limit(1),
  ])
  const row = must(status) as StatusRow | null
  const earliest = (must(first) as { date: string }[] | null)?.[0]?.date ?? null
  const why = row ? await loadWhy(date, row.settings_version) : null
  return { date, row, why, earliest }
}
