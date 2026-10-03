import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { MAX_SAMPLES, parseUpload } from './ingest-schema.ts'

const NOW = new Date('2026-10-03T10:42:00Z') // 6:42am in New York (UTC-4)

function daily(samples: unknown[], extra: Record<string, unknown> = {}) {
  return { schema_version: 1, kind: 'daily', device_tz_offset_min: -240, trigger: 'charger', samples, ...extra }
}

const hr = { type: 'heart_rate', start: '2026-10-03T03:10:00-04:00', end: '2026-10-03T03:10:00-04:00', value: 52, unit: 'count/min', source: "Sabine's Apple Watch" }

function error(body: unknown): string {
  const r = parseUpload(body, NOW)
  assert(!r.ok, 'expected the body to be rejected')
  return r.error
}

Deno.test('a good daily post is accepted and converted to UTC', () => {
  const r = parseUpload(daily([hr]), NOW)
  assert(r.ok)
  assertEquals(r.upload.kind, 'daily')
  assertEquals(r.upload.device_tz_offset_min, -240)
  assertEquals(r.upload.trigger, 'charger')
  assertEquals(r.upload.samples[0], {
    type: 'heart_rate',
    start_at: '2026-10-03T07:10:00.000Z',
    end_at: '2026-10-03T07:10:00.000Z',
    tz_offset_min: -240,
    value: 52,
    unit: 'count/min',
    stage: null,
    source_name: "Sabine's Apple Watch",
    source_device: null,
  })
})

Deno.test('each reading keeps the offset it was sent with', () => {
  const r = parseUpload(daily([{ ...hr, start: '2026-10-02T23:10:00+01:00', end: '2026-10-02T23:10:00+01:00' }]), NOW)
  assert(r.ok)
  assertEquals(r.upload.samples[0].tz_offset_min, 60)
  assertEquals(r.upload.samples[0].start_at, '2026-10-02T22:10:00.000Z')
})

Deno.test('sleep stages are read the way Shortcuts and HealthKit name them', () => {
  const stages: [unknown, string][] = [
    ['Core', 'core'], ['Asleep Core', 'core'], ['asleepCore', 'core'], ['Deep', 'deep'], ['REM', 'rem'],
    ['Awake', 'awake'], ['In Bed', 'in_bed'], ['Asleep', 'asleep'], ['Asleep Unspecified', 'asleep'], [4, 'deep'],
  ]
  for (const [given, stored] of stages) {
    const r = parseUpload(daily([{ type: 'sleep_stage', start: '2026-10-03T01:00:00-04:00', end: '2026-10-03T02:00:00-04:00', stage: given }]), NOW)
    assert(r.ok, `stage ${given}`)
    assertEquals(r.upload.samples[0].stage, stored)
    assertEquals(r.upload.samples[0].value, null)
  }
})

Deno.test('a sleep stage sent as the value is accepted too', () => {
  const r = parseUpload(daily([{ type: 'sleep_stage', start: '2026-10-03T01:00:00-04:00', end: '2026-10-03T02:00:00-04:00', value: 'Core' }]), NOW)
  assert(r.ok)
  assertEquals(r.upload.samples[0].stage, 'core')
})

Deno.test('numbers sent as text are accepted, including a decimal comma', () => {
  const r = parseUpload(daily([{ ...hr, value: '52,5' }], { device_tz_offset_min: '-240' }), NOW)
  assert(r.ok)
  assertEquals(r.upload.samples[0].value, 52.5)
  assertEquals(r.upload.device_tz_offset_min, -240)
})

Deno.test('the phone time zone can be sent as an offset like -04:00', () => {
  for (const given of ['-04:00', '-0400']) {
    const r = parseUpload(daily([hr], { device_tz_offset_min: given }), NOW)
    assert(r.ok)
    assertEquals(r.upload.device_tz_offset_min, -240)
  }
  const india = parseUpload(daily([hr], { device_tz_offset_min: '+05:30' }), NOW)
  assert(india.ok)
  assertEquals(india.upload.device_tz_offset_min, 330)
})

Deno.test('an unknown reading type is rejected', () => {
  assertStringIncludes(error(daily([{ ...hr, type: 'steps' }])), 'unknown type')
})

Deno.test('out-of-range values are rejected', () => {
  assertStringIncludes(error(daily([{ ...hr, value: 300 }])), 'out of range')
  assertStringIncludes(error(daily([{ ...hr, value: 20 }])), 'out of range')
  assertStringIncludes(error(daily([{ ...hr, type: 'hrv_sdnn', value: 0, unit: 'ms' }])), 'out of range')
  assertStringIncludes(error(daily([{ ...hr, type: 'respiratory_rate', value: 70 }])), 'out of range')
  assert(parseUpload(daily([{ ...hr, type: 'hrv_sdnn', value: 300, unit: 'ms' }]), NOW).ok, '300 ms is the top of the range')
})

Deno.test('a rejection never repeats the reading itself', () => {
  const reason = error(daily([{ ...hr, value: 251 }]))
  assert(!reason.includes('251'), reason)
})

Deno.test('times without an offset, impossible dates and readings that end first are rejected', () => {
  assertStringIncludes(error(daily([{ ...hr, start: '2026-10-03T03:10:00', end: '2026-10-03T03:10:00' }])), 'offset')
  assertStringIncludes(error(daily([{ ...hr, start: '3 Oct 2026 at 03:10', end: '3 Oct 2026 at 03:10' }])), 'ISO 8601')
  assertStringIncludes(error(daily([{ ...hr, start: '2026-02-30T03:10:00-04:00', end: '2026-02-30T03:10:00-04:00' }])), 'ISO 8601')
  assertStringIncludes(error(daily([{ ...hr, start: '2026-10-03T03:10:00-04:00', end: '2026-10-03T03:00:00-04:00' }])), 'ends before')
})

Deno.test('readings in the future or too old for a daily sync are rejected', () => {
  assertStringIncludes(error(daily([{ ...hr, start: '2026-10-03T07:30:00-04:00', end: '2026-10-03T07:30:00-04:00' }])), 'future')
  assertStringIncludes(error(daily([{ ...hr, start: '2026-09-20T03:10:00-04:00', end: '2026-09-20T03:10:00-04:00' }])), 'too old')
})

Deno.test('the post itself must be well formed', () => {
  assertStringIncludes(error(null), 'JSON object')
  assertStringIncludes(error(daily([hr], { schema_version: 2 })), 'schema_version')
  assertStringIncludes(error(daily([hr], { kind: 'weekly' })), 'kind')
  assertStringIncludes(error(daily([hr], { device_tz_offset_min: 2000 })), 'device_tz_offset_min')
  assertStringIncludes(error(daily([hr], { device_tz_offset_min: undefined })), 'device_tz_offset_min')
  assertStringIncludes(error(daily([hr], { trigger: 'alarm' })), 'trigger')
  assertStringIncludes(error(daily([hr], { month_id: '2026-09' })), 'only for a backfill')
  assertStringIncludes(error(daily([], { samples: 'lots' })), 'list')
})

Deno.test('a ping carries no readings', () => {
  const r = parseUpload({ schema_version: 1, kind: 'ping', device_tz_offset_min: -240 }, NOW)
  assert(r.ok)
  assertEquals(r.upload.samples, [])
  assertEquals(r.upload.trigger, null)
  assertStringIncludes(error({ schema_version: 1, kind: 'ping', device_tz_offset_min: -240, samples: [hr] }), 'no samples')
})

Deno.test('a backfill needs a month and keeps its readings inside it', () => {
  const old = { ...hr, start: '2026-03-15T03:10:00-04:00', end: '2026-03-15T03:10:00-04:00' }
  const ok = parseUpload({ schema_version: 1, kind: 'backfill', month_id: '2026-03', device_tz_offset_min: -240, samples: [old] }, NOW)
  assert(ok.ok)
  assertEquals(ok.upload.month_id, '2026-03')
  assertStringIncludes(error({ schema_version: 1, kind: 'backfill', device_tz_offset_min: -240, samples: [old] }), 'month_id')
  assertStringIncludes(error({ schema_version: 1, kind: 'backfill', month_id: '2026-05', device_tz_offset_min: -240, samples: [old] }), 'outside month')
  assertStringIncludes(error({ schema_version: 1, kind: 'backfill', month_id: '2024-03', device_tz_offset_min: -240, samples: [] }), 'import window')
})

Deno.test('a backfill reading from the evening before the month starts is allowed', () => {
  const edge = { ...hr, start: '2026-02-28T22:00:00-05:00', end: '2026-02-28T22:00:00-05:00' }
  assert(parseUpload({ schema_version: 1, kind: 'backfill', month_id: '2026-03', device_tz_offset_min: -240, samples: [edge] }, NOW).ok)
})

Deno.test(`more than ${MAX_SAMPLES} readings in one post are rejected`, () => {
  const many = Array.from({ length: MAX_SAMPLES + 1 }, () => hr)
  assertStringIncludes(error(daily(many)), 'more than')
})
