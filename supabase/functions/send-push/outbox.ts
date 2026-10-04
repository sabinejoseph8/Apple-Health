// Sends the outbox's due notifications (Phase 4, tech-spec pattern 5). The
// words come from the wording module; this file decides what each message
// says, records what was shown (D61) and how each send went (R51). The
// database and the push service are passed in, so it is tested without them.

import { type DayWords, morningNotification, type Nudge } from '../_shared/briefing.ts'
import { wording } from '../_shared/wording.ts'

export type Kind = 'morning' | 'reminder' | 'followup'

export interface OutboxRow {
  id: number
  user_id: string
  date: string
  kind: Kind
}

export interface DayStatus extends DayWords {
  nudge: Nudge | null
  total: number | null
  settings_version: number
}

export interface Device {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface Message {
  title: string
  body: string
  url: string
}

// How one send to one device went: delivered, the phone has gone away (the
// push service says 404 or 410), or another failure.
export type SendResult = { ok: true } | { ok: false; gone: boolean; error: string }

export interface Finish {
  status: 'sent' | 'skipped' | 'failed'
  devices?: number
  error?: string
}

export interface OutboxDeps {
  claim(): Promise<OutboxRow[]>
  dayStatus(userId: string, date: string): Promise<DayStatus | null>
  devices(userId: string): Promise<Device[]>
  send(device: Device, message: Message): Promise<SendResult>
  retire(deviceId: string): Promise<void>
  recordShown(row: OutboxRow, day: DayStatus): Promise<void>
  finish(id: number, result: Finish): Promise<void>
}

// The message for a notification, or null when there is nothing to say: a
// morning whose status has since become "none" sends nothing (R48). Tapping
// opens the card with the notification's id and kind: the id records the tap
// (R51), and the kind lets an answer after the 8pm one count as given there (R56).
export function messageFor(row: OutboxRow, day: DayStatus | null): Message | null {
  const url = `/?n=${row.id}&k=${row.kind}`
  const p = wording.push
  if (row.kind === 'reminder') return { title: p.reminderTitle, body: p.reminder, url }
  if (row.kind === 'followup') return { title: p.followUpTitle, body: p.followUp, url }
  const body = day ? morningNotification(day) : null
  return body ? { title: p.morningTitle, body, url } : null
}

export interface SendSummary {
  sent: number
  skipped: number
  failed: number
}

export async function sendDue(deps: OutboxDeps): Promise<SendSummary> {
  const summary: SendSummary = { sent: 0, skipped: 0, failed: 0 }
  for (const row of await deps.claim()) {
    try {
      const day = row.kind === 'morning' ? await deps.dayStatus(row.user_id, row.date) : null
      const message = messageFor(row, day)
      if (!message) {
        await deps.finish(row.id, { status: 'skipped', error: 'no_status' })
        summary.skipped++
        continue
      }
      const devices = await deps.devices(row.user_id)
      if (devices.length === 0) {
        await deps.finish(row.id, { status: 'skipped', error: 'no_devices' })
        summary.skipped++
        continue
      }
      let delivered = 0
      const errors: string[] = []
      for (const device of devices) {
        const result = await deps.send(device, message)
        if (result.ok) {
          delivered++
        } else {
          errors.push(result.error)
          // The phone no longer takes notifications: stop sending to it.
          if (result.gone) await deps.retire(device.id)
        }
      }
      if (delivered > 0) {
        // What the morning notification showed is kept as shown (D61).
        if (row.kind === 'morning' && day) await deps.recordShown(row, day)
        await deps.finish(row.id, { status: 'sent', devices: delivered })
        summary.sent++
      } else {
        await deps.finish(row.id, { status: 'failed', devices: 0, error: errors.join('; ').slice(0, 300) })
        summary.failed++
      }
    } catch (err) {
      await deps.finish(row.id, { status: 'failed', error: String(err).slice(0, 300) })
      summary.failed++
    }
  }
  return summary
}

// Compares the cron key without leaking how much of it matched (D66).
export function sameKey(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
