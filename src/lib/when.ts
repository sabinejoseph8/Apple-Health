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
