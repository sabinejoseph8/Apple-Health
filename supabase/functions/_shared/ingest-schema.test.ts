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

// A post with one bad reading next to a good one: the bad one is set aside
// and the good one kept. Returns the note on why.
function setAside(bad: Record<string, unknown>, extra: Record<string, unknown> = {}, good: unknown = hr): string {
  const r = parseUpload({ ...daily([good, bad]), ...extra }, NOW)
  assert(r.ok, 'one bad reading should not refuse the whole post')
  assertEquals(r.upload.samples.length, 1, 'the good reading is kept')
  assertEquals(r.upload.set_aside, 1)
  assert(r.upload.set_aside_note)
  return r.upload.set_aside_note
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

Deno.test('a reading of an unknown type is set aside', () => {
  assertStringIncludes(setAside({ ...hr, type: 'steps' }), 'unknown type')
})

Deno.test('out-of-range values are set aside', () => {
  assertStringIncludes(setAside({ ...hr, value: 300 }), 'out of range')
  assertStringIncludes(setAside({ ...hr, value: 20 }), 'out of range')
  assertStringIncludes(setAside({ ...hr, type: 'hrv_sdnn', value: 0, unit: 'ms' }), 'out of range')
  assertStringIncludes(setAside({ ...hr, type: 'respiratory_rate', value: 70 }), 'out of range')
  assert(parseUpload(daily([{ ...hr, type: 'hrv_sdnn', value: 300, unit: 'ms' }]), NOW).ok, '300 ms is the top of the range')
})

Deno.test('the note on a set-aside reading never repeats the reading itself', () => {
  const reason = setAside({ ...hr, value: 251 })
  assert(!reason.includes('251'), reason)
})

Deno.test('times without an offset, impossible dates and readings that end first are set aside', () => {
  assertStringIncludes(setAside({ ...hr, start: '2026-10-03T03:10:00', end: '2026-10-03T03:10:00' }), 'offset')
  assertStringIncludes(setAside({ ...hr, start: '3 Oct 2026 at 03:10', end: '3 Oct 2026 at 03:10' }), 'ISO 8601')
  assertStringIncludes(setAside({ ...hr, start: '2026-02-30T03:10:00-04:00', end: '2026-02-30T03:10:00-04:00' }), 'ISO 8601')
  assertStringIncludes(setAside({ ...hr, start: '2026-10-03T03:10:00-04:00', end: '2026-10-03T03:00:00-04:00' }), 'ends before')
})

Deno.test('readings in the future or too old for a daily sync are set aside', () => {
  assertStringIncludes(setAside({ ...hr, start: '2026-10-03T07:30:00-04:00', end: '2026-10-03T07:30:00-04:00' }), 'future')
  assertStringIncludes(setAside({ ...hr, start: '2026-09-20T03:10:00-04:00', end: '2026-09-20T03:10:00-04:00' }), 'too old')
})

Deno.test('resting heart rate may span more than a day, other readings may not', () => {
  const rhr = { ...hr, type: 'resting_hr', start: '2026-10-01T00:05:00-04:00', end: '2026-10-02T06:00:00-04:00', value: 57 }
  const r = parseUpload(daily([rhr]), NOW)
  assert(r.ok)
  assertEquals(r.upload.samples.length, 1, 'a 30-hour resting heart rate reading is kept (seen in the 1c import)')
  assertEquals(r.upload.set_aside, 0)
  assertStringIncludes(setAside({ ...rhr, end: '2026-10-09T06:00:00-04:00' }, {}, rhr), 'lasts too long')
  assertStringIncludes(setAside({ ...hr, start: '2026-10-01T00:05:00-04:00', end: '2026-10-02T06:00:00-04:00' }), 'lasts too long')
})

Deno.test('the note keeps the first few reasons and the count is exact', () => {
  const bad = Array.from({ length: 5 }, () => ({ ...hr, value: 400 }))
  const r = parseUpload(daily([hr, ...bad]), NOW)
  assert(r.ok)
  assertEquals(r.upload.set_aside, 5)
  assertEquals(r.upload.set_aside_note?.split('; ').length, 3)
  const clean = parseUpload(daily([hr]), NOW)
  assert(clean.ok)
  assertEquals([clean.upload.set_aside, clean.upload.set_aside_note], [0, null])
})

Deno.test('the post itself must be well formed', () => {
  assertStringIncludes(error(null), 'JSON object')
  assertStringIncludes(error(daily([hr], { schema_version: 2 })), 'schema_version')
  assertStringIncludes(error(daily([hr], { kind: 'weekly' })), 'kind')
  assertStringIncludes(error(daily([hr], { device_tz_offset_min: 2000 })), 'device_tz_offset_min')
  assertStringIncludes(error(daily([hr], { device_tz_offset_min: undefined })), 'device_tz_offset_min')
  assertStringIncludes(error(daily([hr], { month_id: '2026-09' })), 'only for a backfill')
  assertStringIncludes(error(daily([], { samples: 'lots' })), 'list')
})

Deno.test('an unrecognised trigger word is recorded as unknown, and the readings are kept', () => {
  for (const given of ['Tiktok', 'alarm', 42]) {
    const r = parseUpload(daily([hr], { trigger: given }), NOW)
    assert(r.ok, String(given))
    assertEquals(r.upload.trigger, null)
    assertEquals(r.upload.samples.length, 1)
  }
  const spaced = parseUpload(daily([hr], { trigger: ' Charger ' }), NOW)
  assert(spaced.ok)
  assertEquals(spaced.upload.trigger, 'charger')
})

Deno.test('a sync from the card\'s Sync now button is recorded as such (D84)', () => {
  const r = parseUpload(daily([hr], { trigger: 'button' }), NOW)
  assert(r.ok)
  assertEquals(r.upload.trigger, 'button')
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
  const outside = parseUpload({ schema_version: 1, kind: 'backfill', month_id: '2026-05', device_tz_offset_min: -240, samples: [old] }, NOW)
  assert(outside.ok)
  assertEquals(outside.upload.samples, [])
  assertStringIncludes(outside.upload.set_aside_note ?? '', 'outside month')
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

// The exact shape the Clarivi Sync Shortcut posts (scripts/shortcut/build_shortcut.py):
// text values, the phone's offset as "-04:00" and the sleep stage in "stage".
Deno.test('a post shaped like the Shortcut\'s is accepted', () => {
  const r = parseUpload({
    schema_version: 1,
    kind: 'daily',
    device_tz_offset_min: '-04:00',
    trigger: 'charger',
    samples: [
      { type: 'heart_rate', start: '2026-10-03T03:10:00-04:00', end: '2026-10-03T03:10:00-04:00', value: '52', unit: 'count/min', source: 'Sabine’s Apple Watch' },
      { type: 'hrv_sdnn', start: '2026-10-03T03:12:00-04:00', end: '2026-10-03T03:13:00-04:00', value: '41.7', unit: 'ms', source: 'Sabine’s Apple Watch' },
      { type: 'resting_hr', start: '2026-10-02T00:01:00-04:00', end: '2026-10-02T23:59:00-04:00', value: '57', unit: 'count/min', source: 'Sabine’s Apple Watch' },
      { type: 'sleep_stage', start: '2026-10-03T01:00:00-04:00', end: '2026-10-03T01:40:00-04:00', stage: 'Core', source: 'Sabine’s Apple Watch' },
    ],
  }, NOW)
  assert(r.ok)
  assertEquals(r.upload.device_tz_offset_min, -240)
  assertEquals(r.upload.samples.map((s) => s.value), [52, 41.7, 57, null])
  assertEquals(r.upload.samples[3].stage, 'core')
  const empty = parseUpload({ schema_version: 1, kind: 'daily', device_tz_offset_min: '-04:00', trigger: 'app', samples: [] }, NOW)
  assert(empty.ok, 'a daily post with no readings is still logged')
})

// Columns, the shape the Shortcut sends since the 3 October 2026 spike.
function seriesPost(series: unknown[]) {
  return { schema_version: 1, kind: 'daily', device_tz_offset_min: '-04:00', trigger: 'charger', series }
}

Deno.test('columns are lined up into one reading each', () => {
  const r = parseUpload(seriesPost([
    {
      type: 'heart_rate',
      start: ['2026-10-03T03:10:00-04:00', '2026-10-03T03:15:00-04:00'],
      end: ['2026-10-03T03:10:00-04:00', '2026-10-03T03:15:00-04:00'],
      value: ['52', '50'],
      unit: ['count/min', 'count/min'],
      source: ['Ultra Watch', 'Ultra Watch'],
    },
    {
      type: 'sleep_stage',
      start: ['2026-10-03T01:00:00-04:00'],
      end: ['2026-10-03T01:40:00-04:00'],
      value: ['Core'],
      unit: [''],
      source: ['Ultra Watch'],
    },
  ]), NOW)
  assert(r.ok)
  assertEquals(r.upload.samples.length, 3)
  assertEquals(r.upload.samples.map((s) => [s.type, s.value, s.stage]), [['heart_rate', 52, null], ['heart_rate', 50, null], ['sleep_stage', null, 'core']])
  assertEquals(r.upload.samples[1].start_at, '2026-10-03T07:15:00.000Z')
  assertEquals(r.upload.samples[0].source_name, 'Ultra Watch')
  assertEquals(r.upload.samples[2].unit, null)
})

Deno.test('a reading type with no readings arrives as [""] and adds nothing', () => {
  const r = parseUpload(seriesPost([
    { type: 'respiratory_rate', start: [''], end: [''], value: [''], unit: [''], source: [''] },
  ]), NOW)
  assert(r.ok)
  assertEquals(r.upload.samples, [])
})

Deno.test('columns of different lengths are rejected', () => {
  assertStringIncludes(error(seriesPost([
    { type: 'heart_rate', start: ['2026-10-03T03:10:00-04:00', '2026-10-03T03:15:00-04:00'], end: ['2026-10-03T03:10:00-04:00'], value: ['52', '50'] },
  ])), 'different number of entries')
  assertStringIncludes(error(seriesPost([{ type: 'heart_rate', start: '2026-10-03T03:10:00-04:00' }])), 'must be a list')
  assertStringIncludes(error(seriesPost([{ type: 'heart_rate', value: ['52'] }])), 'start is missing')
})

Deno.test('heart rate is kept only from 6pm to noon by its own local time (D18)', () => {
  const at = (time: string, offset = '-04:00') => `2026-10-02T${time}${offset}`
  const r = parseUpload(seriesPost([
    {
      type: 'heart_rate',
      start: [at('11:59:00'), at('12:00:00'), at('17:59:00'), at('18:00:00'), at('14:00:00', '+01:00')],
      end: [at('11:59:00'), at('12:00:00'), at('17:59:00'), at('18:00:00'), at('14:00:00', '+01:00')],
      value: ['60', '61', '62', '63', '64'],
    },
    { type: 'hrv_sdnn', start: [at('15:00:00')], end: [at('15:01:00')], value: ['40'], unit: ['ms'] },
  ]), NOW)
  assert(r.ok)
  assertEquals(r.upload.samples.map((s) => s.value), [60, 63, 40])
})

Deno.test(`more than ${MAX_SAMPLES} readings across columns are rejected`, () => {
  const many = Array.from({ length: MAX_SAMPLES + 1 }, () => '2026-10-03T03:10:00-04:00')
  assertStringIncludes(error(seriesPost([{ type: 'heart_rate', start: many, end: many, value: many.map(() => '52') }])), 'more than')
})

Deno.test('a ping carries no columns either', () => {
  assertStringIncludes(error({
    schema_version: 1, kind: 'ping', device_tz_offset_min: -240,
    series: [{ type: 'heart_rate', start: ['2026-10-03T03:10:00-04:00'], value: ['52'] }],
  }), 'no samples')
})

Deno.test('an extra column of the wrong length is set aside, not the whole post', () => {
  const r = parseUpload(seriesPost([{
    type: 'sleep_stage',
    start: ['2026-10-03T01:00:00-04:00', '2026-10-03T01:40:00-04:00'],
    end: ['2026-10-03T01:40:00-04:00', '2026-10-03T02:10:00-04:00'],
    value: ['Core', 'REM'],
    unit: [''],
    source: ['Ultra Watch', 'Ultra Watch'],
  }]), NOW)
  assert(r.ok)
  assertEquals(r.upload.samples.map((s) => [s.stage, s.unit, s.source_name]), [['core', null, 'Ultra Watch'], ['rem', null, 'Ultra Watch']])
  assertStringIncludes(error(seriesPost([{
    type: 'sleep_stage', start: ['2026-10-03T01:00:00-04:00', '2026-10-03T01:40:00-04:00'],
    end: ['2026-10-03T01:40:00-04:00'], value: ['Core', 'REM'],
  }])), 'end has a different number of entries')
})

// A part of a month from the import (scripts/shortcut/build_shortcut.py): an
// empty heart rate series first, then days of heart rate with only start,
// value and source. End becomes the start; unit is left empty.
Deno.test('an import part with slim heart rate columns is accepted', () => {
  const day = (d: string) => ({
    type: 'heart_rate',
    start: [`2026-09-${d}T02:00:00-05:00`, `2026-09-${d}T03:00:00-05:00`],
    value: ['52', '50'],
    source: ['Ultra Watch', 'Ultra Watch'],
  })
  const r = parseUpload({
    schema_version: 1, kind: 'backfill', month_id: '2026-09', device_tz_offset_min: '-05:00', trigger: 'manual',
    series: [{ type: 'heart_rate', start: [''] }, day('01'), day('02')],
  }, NOW)
  assert(r.ok)
  assertEquals(r.upload.samples.length, 4)
  assertEquals(r.upload.samples[0].end_at, r.upload.samples[0].start_at)
  assertEquals(r.upload.samples[0].unit, null)
  assertEquals(r.upload.samples[3].source_name, 'Ultra Watch')
})

Deno.test('a backfill post can say it is the month\'s last part', () => {
  const base = { schema_version: 1, kind: 'backfill', month_id: '2026-09', device_tz_offset_min: -240, samples: [] }
  const last = parseUpload({ ...base, month_complete: true }, NOW)
  assert(last.ok)
  assertEquals(last.upload.month_complete, true)
  const part = parseUpload(base, NOW)
  assert(part.ok)
  assertEquals(part.upload.month_complete, false)
  const daily = parseUpload({ schema_version: 1, kind: 'daily', device_tz_offset_min: -240, month_complete: true, samples: [] }, NOW)
  assert(daily.ok)
  assertEquals(daily.upload.month_complete, false, 'only a backfill can complete a month')
  assertStringIncludes(error({ ...base, month_complete: 'yes' }), 'month_complete')
})
