import { wording } from '../../supabase/functions/_shared/wording'

const t = wording.time

// "6:42am", in the phone's own time zone.
export function formatTime(d: Date): string {
  const hours = d.getHours()
  return `${hours % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`
}

// A moment in the phone's own time zone, for example "today at 6:42am",
// "yesterday at 6:51am" or "3 Oct at 6:42am".
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const time = formatTime(d)
  if (d.toDateString() === now.toDateString()) return t.todayAt(time)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return t.yesterdayAt(time)
  return t.dayAt(`${d.getDate()} ${t.months[d.getMonth()]}`, time)
}

// When a sync arrived, for "Updated from your Watch ...": "at 6:42am" today,
// otherwise "yesterday at 9:15pm" or "3 Oct at 6:42am".
export function syncWhen(d: Date, now: Date = new Date()): string {
  return d.toDateString() === now.toDateString() ? t.at(formatTime(d)) : formatWhen(d.toISOString(), now)
}

// The phone's local date as the database stores it: "2026-09-29".
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "Tuesday 29 September"
export function dateLine(d: Date): string {
  return wording.day.date(wording.day.weekdays[d.getDay()], d.getDate(), wording.day.monthsLong[d.getMonth()])
}

// Good morning before noon, good afternoon until 6pm, then good evening.
export function greeting(d: Date): string {
  const h = d.getHours()
  return h < 12 ? wording.day.morning : h < 18 ? wording.day.afternoon : wording.day.evening
}

// Minutes since local midnight.
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

const asDay = (date: string) => new Date(`${date}T12:00:00Z`)

// "Tue 29 Sep", for a night on the trend charts.
export function shortNight(date: string): string {
  const d = asDay(date)
  return `${wording.day.weekdaysShort[d.getUTCDay()]} ${d.getUTCDate()} ${t.months[d.getUTCMonth()]}`
}

// "21 Sep", and "21 September".
export function shortDate(date: string): string {
  const d = asDay(date)
  return `${d.getUTCDate()} ${t.months[d.getUTCMonth()]}`
}

export function longDate(date: string): string {
  const d = asDay(date)
  return `${d.getUTCDate()} ${wording.day.monthsLong[d.getUTCMonth()]}`
}

// The Monday the next weekly digest is built: from 5am local, in the hourly
// run after it (D72). On a Monday morning that is today; from Monday noon,
// the coming Monday.
export function nextDigestDay(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysToMonday = (8 - d.getDay()) % 7
  const today = daysToMonday === 0 && now.getHours() < 12
  d.setDate(d.getDate() + (today ? 0 : daysToMonday === 0 ? 7 : daysToMonday))
  return d
}
