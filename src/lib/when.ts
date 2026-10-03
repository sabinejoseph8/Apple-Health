import { wording } from '../../supabase/functions/_shared/wording'

const t = wording.time

// A moment in the phone's own time zone, for example "today at 6:42am" or
// "3 Oct at 6:42am".
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const hours = d.getHours()
  const time = `${hours % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`
  if (d.toDateString() === now.toDateString()) return t.todayAt(time)
  return t.dayAt(`${d.getDate()} ${t.months[d.getMonth()]}`, time)
}
