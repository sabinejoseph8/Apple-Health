// The shared schema for posts from the iPhone Shortcut (tech-spec sections 4
// and 6). parseUpload() checks a post and returns it in the shape the
// database's ingest_upload() expects, or a short reason it was rejected.
// Reasons never include a reading's value, so no health data goes back to
// the Shortcut or into the error log.
//
// A later HealthKit app can post the same format (tech-spec pattern 9).

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
}

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
function parseTime(value: unknown): { ms: number; offset: number; local: { y: number; m: number; d: number } } | null {
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
  return { ms: wall.getTime() - offset * MINUTE, offset, local: { y, m: mo, d } }
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

function parseSample(raw: unknown, index: number, kind: Kind, monthId: string | null, nowMs: number): CleanSample {
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
  if (end.ms - start.ms > MAX_SAMPLE_LENGTH) reject(`${label}: lasts more than a day`)
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

    let trigger: Trigger | null = null
    if (body.trigger !== undefined && body.trigger !== null && body.trigger !== '') {
      const t = typeof body.trigger === 'string' ? body.trigger.trim().toLowerCase() : ''
      if (!(TRIGGERS as readonly string[]).includes(t)) reject('unknown trigger')
      trigger = t as Trigger
    }

    const rawSamples = body.samples ?? []
    if (!Array.isArray(rawSamples)) reject('samples must be a list')
    if (kind === 'ping' && rawSamples.length > 0) reject('a ping carries no samples')
    if (rawSamples.length > MAX_SAMPLES) reject(`more than ${MAX_SAMPLES} samples`)

    const nowMs = now.getTime()
    const samples = rawSamples.map((s, i) => parseSample(s, i, kind as Kind, monthId, nowMs))

    return {
      ok: true,
      upload: {
        schema_version: SCHEMA_VERSION,
        kind: kind as Kind,
        month_id: monthId,
        device_tz_offset_min: deviceOffset,
        trigger,
        samples,
      },
    }
  } catch (e) {
    if (e instanceof Rejected) return { ok: false, error: e.message }
    throw e
  }
}
