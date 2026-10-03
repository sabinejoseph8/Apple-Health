// The shared schema for posts from the iPhone Shortcut (tech-spec sections 4
// and 6). parseUpload() checks a post and returns it in the shape the
// database's ingest_upload() expects, or a short reason it was rejected.
// Reasons never include a reading's value, so no health data goes back to
// the Shortcut or into the error log.
//
// Readings come in either of two shapes, and both become the same rows:
// - samples: one object per reading ({type, start, end, value, unit, ...}).
// - series: one object per reading type, holding a list per column
//   ({type, start: [...], end: [...], value: [...], unit: [...], source: [...]}).
//   The Shortcut sends this shape: building one line per reading took over
//   14 minutes for a day of heart rate on an iPhone, columns about a second
//   (Phase 1b spike, 3 October 2026).
//
// Heart rate is kept only from 6pm to noon, by each reading's own local time
// (D18). The Shortcut can only fetch whole days, so the window is applied here.
//
// A reading that fails a check (an unknown type, an impossible time, a value
// out of range) is set aside and the rest of the post is stored; the post's
// upload row records how many were set aside and why, never the values
// (agreed by Sabine, 3 October 2026, after one resting heart rate reading
// blocked a month of the import). A post that is malformed as a whole (not
// JSON, an unknown schema version or kind, a bad month) is still refused.
//
// A later HealthKit app can post either shape (tech-spec pattern 9).

export const SCHEMA_VERSION = 1
export const MAX_BODY_BYTES = 5 * 1024 * 1024
export const MAX_SAMPLES = 50_000

const SAMPLE_TYPES = ['heart_rate', 'hrv_sdnn', 'sleep_stage', 'resting_hr', 'respiratory_rate'] as const
type SampleType = (typeof SAMPLE_TYPES)[number]
type QuantityType = Exclude<SampleType, 'sleep_stage'>

// Sensible ranges (tech-spec section 6, Default).
const RANGES: Record<QuantityType, [number, number]> = {
  heart_rate: [25, 250],
  resting_hr: [25, 250],
  hrv_sdnn: [1, 300],
  respiratory_rate: [4, 60],
}

type Stage = 'in_bed' | 'asleep' | 'awake' | 'core' | 'deep' | 'rem'

// Sleep stages as Shortcuts and HealthKit name them, with spaces, case and
// underscores ignored ("Core", "Asleep Core", "asleepCore"), plus HealthKit's
// numbers 0 to 5.
const STAGES: Record<string, Stage> = {
  inbed: 'in_bed',
  asleep: 'asleep',
  asleepunspecified: 'asleep',
  unspecified: 'asleep',
  awake: 'awake',
  core: 'core',
  asleepcore: 'core',
  deep: 'deep',
  asleepdeep: 'deep',
  rem: 'rem',
  asleeprem: 'rem',
  '0': 'in_bed',
  '1': 'asleep',
  '2': 'awake',
  '3': 'core',
  '4': 'deep',
  '5': 'rem',
}

const KINDS = ['daily', 'backfill', 'ping'] as const
type Kind = (typeof KINDS)[number]

const TRIGGERS = ['charger', 'app', 'manual'] as const
type Trigger = (typeof TRIGGERS)[number]

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const FUTURE_SLACK = 10 * MINUTE
const DAILY_LOOKBACK = 4 * DAY
const BACKFILL_MONTHS = 13
const MAX_SAMPLE_LENGTH = DAY
// Resting heart rate is one reading per day that can run past a day (1c).
const MAX_LENGTH: Partial<Record<SampleType, number>> = { resting_hr: 7 * DAY }
// Heart rate window (D18): from 6pm to noon, local time.
const HR_WINDOW_START = 18 * 60
const HR_WINDOW_END = 12 * 60

export interface CleanSample {
  type: SampleType
  start_at: string
  end_at: string
  tz_offset_min: number
  value: number | null
  unit: string | null
  stage: Stage | null
  source_name: string | null
  source_device: string | null
}

export interface CleanUpload {
  schema_version: number
  kind: Kind
  month_id: string | null
  device_tz_offset_min: number
  trigger: Trigger | null
  samples: CleanSample[]
  // Readings that failed a check and were left out, and the first few reasons.
  set_aside: number
  set_aside_note: string | null
}

const SET_ASIDE_REASONS_KEPT = 3

export type ParseResult = { ok: true; upload: CleanUpload } | { ok: false; error: string }

class Rejected extends Error {}

function reject(reason: string): never {
  throw new Rejected(reason)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validOffset(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= -720 && minutes <= 840
}

// "+05:30", "-0400", "+01" or "Z" to minutes east of UTC.
function offsetFromText(text: string): number | null {
  if (text === 'Z') return 0
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(text)
  if (!m) return null
  const minutes = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
  return validOffset(minutes) ? minutes : null
}

const ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)$/

// An ISO 8601 time with its offset, as the Shortcut formats it. The offset is
// required: it's how a reading keeps its local time.
function parseTime(
  value: unknown,
): { ms: number; offset: number; local: { y: number; m: number; d: number; minutes: number } } | null {
  if (typeof value !== 'string') return null
  const m = ISO_TIME.exec(value.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number)
  const offset = offsetFromText(m[7])
  if (offset === null) return null
  const wall = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  if (wall.getUTCFullYear() !== y || wall.getUTCMonth() !== mo - 1 || wall.getUTCDate() !== d ||
      wall.getUTCHours() !== h || wall.getUTCMinutes() !== mi || wall.getUTCSeconds() !== s) {
    return null
  }
  return { ms: wall.getTime() - offset * MINUTE, offset, local: { y, m: mo, d, minutes: h * 60 + mi } }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(value)) return Number(value.trim().replace(',', '.'))
  return null
}

function optionalText(value: unknown, max: number, what: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') reject(`${what} must be text`)
  const text = value.trim()
  if (text.length > max) reject(`${what} is too long`)
  return text === '' ? null : text
}

function parseStage(value: unknown): Stage | null {
  if (typeof value === 'number') return STAGES[String(value)] ?? null
  if (typeof value !== 'string') return null
  return STAGES[value.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null
}

function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1)
}

// A checked reading, or null for heart rate outside the 6pm-to-noon window.
function parseSample(raw: unknown, index: number, kind: Kind, monthId: string | null, nowMs: number): CleanSample | null {
  const where = `sample ${index + 1}`
  if (!isRecord(raw)) reject(`${where}: not an object`)
  const type = raw.type
  if (typeof type !== 'string' || !(SAMPLE_TYPES as readonly string[]).includes(type)) {
    reject(`${where}: unknown type`)
  }
  const label = `${where} (${type})`

  const start = parseTime(raw.start)
  const end = parseTime(raw.end ?? raw.start)
  if (!start) reject(`${label}: start must be an ISO 8601 time with its offset`)
  if (!end) reject(`${label}: end must be an ISO 8601 time with its offset`)
  if (end.ms < start.ms) reject(`${label}: ends before it starts`)
  const maxLength = MAX_LENGTH[type as SampleType] ?? MAX_SAMPLE_LENGTH
  if (end.ms - start.ms > maxLength) reject(`${label}: lasts too long`)
  if (start.ms > nowMs + FUTURE_SLACK || end.ms > nowMs + FUTURE_SLACK) reject(`${label}: is in the future`)

  if (kind === 'backfill' && monthId) {
    const [y, m] = monthId.split('-').map(Number)
    const first = Date.UTC(y, m - 1, 1) - DAY
    const last = Date.UTC(y, m, 1) + DAY
    const localStart = Date.UTC(start.local.y, start.local.m - 1, start.local.d)
    if (localStart < first || localStart >= last) reject(`${label}: is outside month ${monthId}`)
  } else if (start.ms < nowMs - DAILY_LOOKBACK) {
    reject(`${label}: is too old for a daily sync`)
  }

  if (type === 'heart_rate' && start.local.minutes >= HR_WINDOW_END && start.local.minutes < HR_WINDOW_START) {
    return null
  }

  let value: number | null = null
  let stage: Stage | null = null
  if (type === 'sleep_stage') {
    stage = parseStage(raw.stage ?? raw.value)
    if (!stage) reject(`${label}: unknown sleep stage`)
  } else {
    value = parseNumber(raw.value)
    if (value === null) reject(`${label}: value must be a number`)
    const [low, high] = RANGES[type as QuantityType]
    if (value < low || value > high) reject(`${label}: value out of range`)
  }

  return {
    type: type as SampleType,
    start_at: new Date(start.ms).toISOString(),
    end_at: new Date(end.ms).toISOString(),
    tz_offset_min: start.offset,
    value,
    unit: optionalText(raw.unit, 32, `${label}: unit`),
    stage,
    source_name: optionalText(raw.source, 200, `${label}: source`),
    source_device: optionalText(raw.device, 200, `${label}: device`),
  }
}

const SERIES_COLUMNS = ['start', 'end', 'value', 'unit', 'source', 'device', 'stage'] as const
// Extra details: if one of these is a different length from start, it's set
// aside rather than losing the whole post over it.
const EXTRA_COLUMNS = new Set(['unit', 'source', 'device'])

// Lines up one series' columns into one object per reading. A column the
// Shortcut built from no readings arrives as [""], which means none.
function rowsFromSeries(raw: unknown, index: number): Record<string, unknown>[] {
  const where = `series ${index + 1}`
  if (!isRecord(raw)) reject(`${where}: not an object`)
  const columns: Partial<Record<(typeof SERIES_COLUMNS)[number], unknown[]>> = {}
  for (const name of SERIES_COLUMNS) {
    const column = raw[name]
    if (column === undefined || column === null) continue
    if (!Array.isArray(column)) reject(`${where}: ${name} must be a list`)
    columns[name] = column
  }
  const start = columns.start
  if (!start) reject(`${where}: start is missing`)
  if (start.length === 1 && start[0] === '') return []
  for (const [name, column] of Object.entries(columns)) {
    if (column.length === start.length) continue
    if (EXTRA_COLUMNS.has(name)) delete columns[name as keyof typeof columns]
    else reject(`${where}: ${name} has a different number of entries from start`)
  }
  return start.map((_, i) => {
    const row: Record<string, unknown> = { type: raw.type }
    for (const [name, column] of Object.entries(columns)) row[name] = column[i]
    return row
  })
}

export function parseUpload(body: unknown, now: Date): ParseResult {
  try {
    if (!isRecord(body)) reject('the body must be a JSON object')

    if (parseNumber(body.schema_version) !== SCHEMA_VERSION) reject('unknown schema_version')

    const kind = body.kind
    if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) reject('unknown kind')

    let deviceOffset: number | null = null
    if (typeof body.device_tz_offset_min === 'string') {
      deviceOffset = offsetFromText(body.device_tz_offset_min.trim()) ?? parseNumber(body.device_tz_offset_min)
    } else {
      deviceOffset = parseNumber(body.device_tz_offset_min)
    }
    if (deviceOffset === null || !validOffset(deviceOffset)) reject('device_tz_offset_min must be minutes from UTC')

    let monthId: string | null = null
    if (kind === 'backfill') {
      if (typeof body.month_id !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month_id)) {
        reject('a backfill needs month_id as YYYY-MM')
      }
      monthId = body.month_id
      const [y, m] = monthId.split('-').map(Number)
      const current = monthIndex(now.getUTCFullYear(), now.getUTCMonth() + 1)
      if (monthIndex(y, m) > current + 1 || monthIndex(y, m) < current - BACKFILL_MONTHS) {
        reject('month_id is outside the import window')
      }
    } else if (body.month_id !== undefined && body.month_id !== null && body.month_id !== '') {
      reject('month_id is only for a backfill')
    }

    // Which automation ran the Shortcut. A word the automation's Text box
    // doesn't spell exactly (for example the app's name instead of "app") is
    // recorded as unknown rather than costing the morning's readings.
    let trigger: Trigger | null = null
    if (typeof body.trigger === 'string') {
      const t = body.trigger.trim().toLowerCase()
      if ((TRIGGERS as readonly string[]).includes(t)) trigger = t as Trigger
    }

    const rawSamples = body.samples ?? []
    if (!Array.isArray(rawSamples)) reject('samples must be a list')
    const rawSeries = body.series ?? []
    if (!Array.isArray(rawSeries)) reject('series must be a list')
    const rows = [...rawSamples]
    rawSeries.forEach((series, i) => {
      for (const row of rowsFromSeries(series, i)) {
        rows.push(row)
        if (rows.length > MAX_SAMPLES) reject(`more than ${MAX_SAMPLES} samples`)
      }
    })
    if (kind === 'ping' && rows.length > 0) reject('a ping carries no samples')
    if (rows.length > MAX_SAMPLES) reject(`more than ${MAX_SAMPLES} samples`)

    const nowMs = now.getTime()
    const samples: CleanSample[] = []
    const reasons: string[] = []
    rows.forEach((row, i) => {
      try {
        const sample = parseSample(row, i, kind as Kind, monthId, nowMs)
        if (sample) samples.push(sample)
      } catch (e) {
        if (!(e instanceof Rejected)) throw e
        reasons.push(e.message)
      }
    })

    return {
      ok: true,
      upload: {
        schema_version: SCHEMA_VERSION,
        kind: kind as Kind,
        month_id: monthId,
        device_tz_offset_min: deviceOffset,
        trigger,
        samples,
        set_aside: reasons.length,
        set_aside_note: reasons.length ? reasons.slice(0, SET_ASIDE_REASONS_KEPT).join('; ').slice(0, 300) : null,
      },
    }
  } catch (e) {
    if (e instanceof Rejected) return { ok: false, error: e.message }
    throw e
  }
}
