import { assertEquals } from 'jsr:@std/assert@1'
import { type DayStatus, type Device, type Finish, messageFor, type OutboxDeps, type OutboxRow, sameKey, sendDue } from './outbox.ts'

// The design's sample day, made up: Ease off, HRV and sleep outside their range.
const sampleDay: DayStatus = {
  status: 'ease_off',
  nudge: 'train_easy',
  total: 1.64,
  settings_version: 2,
  readings_used: 3,
  reason_codes: ['hrv_outside_range', 'sleep_outside_range', 'sleeping_hr_worse_than_normal'],
  composite_fired: false,
  points: {},
}
const phone: Device = { id: 'd1', endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' }

function fakeDeps(rows: OutboxRow[], over: Partial<OutboxDeps> = {}) {
  const log = { finished: new Map<number, Finish>(), shown: [] as number[], retired: [] as string[], sent: [] as string[] }
  const deps: OutboxDeps = {
    claim: () => Promise.resolve(rows),
    dayStatus: () => Promise.resolve(sampleDay),
    devices: () => Promise.resolve([phone]),
    send: (_d, m) => {
      log.sent.push(m.body)
      return Promise.resolve({ ok: true })
    },
    retire: (id) => {
      log.retired.push(id)
      return Promise.resolve()
    },
    recordShown: (row) => {
      log.shown.push(row.id)
      return Promise.resolve()
    },
    finish: (id, result) => {
      log.finished.set(id, result)
      return Promise.resolve()
    },
    ...over,
  }
  return { deps, log }
}

const row = (id: number, kind: OutboxRow['kind']): OutboxRow => ({ id, user_id: 'u1', date: '2026-09-29', kind })

Deno.test('the morning notification says the status and reason, and opens the card with its id (R48, R51)', () => {
  assertEquals(messageFor(row(7, 'morning'), sampleDay), {
    title: 'Clarivi',
    body: 'Ease off today: HRV well below your usual, sleep short',
    url: '/?n=7&k=morning',
  })
})

Deno.test('the reminder and the 8pm question carry no health detail (R49, R50)', () => {
  assertEquals(messageFor(row(8, 'reminder'), null)?.body, "No sync yet this morning. Run your readiness Shortcut before noon to get today's nudge.")
  assertEquals(messageFor(row(9, 'followup'), null)?.body, "Did you follow today's nudge?")
})

Deno.test('a morning whose status has gone is not sent (R48)', async () => {
  const { deps, log } = fakeDeps([row(1, 'morning')], { dayStatus: () => Promise.resolve({ ...sampleDay, status: 'none', nudge: null }) })
  assertEquals(await sendDue(deps), { sent: 0, skipped: 1, failed: 0 })
  assertEquals(log.finished.get(1), { status: 'skipped', error: 'no_status' })
  assertEquals(log.sent, [])
})

Deno.test('a sent morning notification records what it showed (D61)', async () => {
  const { deps, log } = fakeDeps([row(1, 'morning'), row(2, 'followup')])
  assertEquals(await sendDue(deps), { sent: 2, skipped: 0, failed: 0 })
  assertEquals(log.finished.get(1), { status: 'sent', devices: 1 })
  assertEquals(log.shown, [1])
})

Deno.test('someone with no phone set up is skipped, not failed', async () => {
  const { deps, log } = fakeDeps([row(3, 'reminder')], { devices: () => Promise.resolve([]) })
  assertEquals(await sendDue(deps), { sent: 0, skipped: 1, failed: 0 })
  assertEquals(log.finished.get(3), { status: 'skipped', error: 'no_devices' })
})

Deno.test('a phone that has gone away is retired, and an all-failed send is recorded as failed', async () => {
  const { deps, log } = fakeDeps([row(4, 'morning')], { send: () => Promise.resolve({ ok: false, gone: true, error: 'push_410' }) })
  assertEquals(await sendDue(deps), { sent: 0, skipped: 0, failed: 1 })
  assertEquals(log.retired, ['d1'])
  assertEquals(log.finished.get(4), { status: 'failed', devices: 0, error: 'push_410' })
  assertEquals(log.shown, [])
})

Deno.test('one notification failing does not stop the rest', async () => {
  let first = true
  const { deps, log } = fakeDeps([row(5, 'morning'), row(6, 'reminder')], {
    dayStatus: () => {
      if (first) {
        first = false
        return Promise.reject(new Error('lookup failed'))
      }
      return Promise.resolve(sampleDay)
    },
  })
  assertEquals(await sendDue(deps), { sent: 1, skipped: 0, failed: 1 })
  assertEquals(log.finished.get(6)?.status, 'sent')
})

Deno.test('the cron key must match exactly (D66)', () => {
  assertEquals(sameKey('abc123', 'abc123'), true)
  assertEquals(sameKey('abc124', 'abc123'), false)
  assertEquals(sameKey('abc12', 'abc123'), false)
  assertEquals(sameKey(null, 'abc123'), false)
  assertEquals(sameKey('abc123', undefined), false)
  assertEquals(sameKey('', ''), false)
})
