import type { Reading } from '../../supabase/functions/_shared/briefing'
import { wording } from '../../supabase/functions/_shared/wording'
import type { NightPoint } from '../lib/why'

const W = 300
const H = 72
const PAD = 8

// Four weeks of nights at full card width: the normal range as a band, normal
// as a dashed line, nights as a line with gaps where there is no reading, and
// last night as a dot, orange when outside the range (design.md, Mini chart).
// No band while the normal is still being learned.
export default function MiniChart({
  reading,
  nights,
  normal,
  low,
  high,
  outside,
  label,
  end = wording.why.chart.end,
}: {
  reading: Reading
  nights: NightPoint[]
  normal: number | null
  low: number | null
  high: number | null
  outside: boolean
  label: string
  // The label under the chart's last night: "Last night", or "That night" on a past day.
  end?: string
}) {
  const values = nights.map((p) => p.value).filter((v): v is number => v !== null)
  const scale = [...values, ...[normal, low, high].filter((v): v is number => v !== null)]
  let min = Math.min(...scale)
  let max = Math.max(...scale)
  if (!Number.isFinite(min)) [min, max] = [0, 1]
  if (max - min < 1e-6) [min, max] = [min - 1, max + 1]
  const x = (k: number) => PAD / 2 + (k / Math.max(1, nights.length - 1)) * (W - PAD)
  const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD)

  // One path piece per run of nights with a reading; gaps stay gaps (R45).
  let d = ''
  let drawing = false
  nights.forEach((p, k) => {
    if (p.value === null) {
      drawing = false
      return
    }
    const next = nights[k + 1]?.value
    const lonely = !drawing && (next === null || next === undefined)
    d += `${drawing ? 'L' : 'M'}${x(k).toFixed(1)} ${y(p.value).toFixed(1)}${lonely ? 'h0.1' : ''}`
    drawing = true
  })

  const last = nights[nights.length - 1]?.value ?? null
  const showBand = low !== null && high !== null

  return (
    <figure className="mini-chart">
      <div className="mini-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} width="100%" height={H}>
          {showBand && <rect x={0} y={y(high)} width={W} height={Math.max(1, y(low) - y(high))} fill={`var(--${cssName(reading)}-band)`} />}
          {showBand && normal !== null && (
            <line x1={0} x2={W} y1={y(normal)} y2={y(normal)} stroke={`var(--${cssName(reading)}-median)`} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          )}
          <path d={d} fill="none" stroke={`var(--${cssName(reading)})`} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {last !== null && (
          <span
            className="mini-chart-dot"
            style={{
              left: `${(x(nights.length - 1) / W) * 100}%`,
              top: `${y(last)}px`,
              background: outside ? 'var(--attention)' : `var(--${cssName(reading)})`,
            }}
          />
        )}
      </div>
      <figcaption className="mini-chart-labels">
        <span>{wording.why.chart.start}</span>
        {showBand && <span>{wording.why.chart.band}</span>}
        <span>{end}</span>
      </figcaption>
    </figure>
  )
}

export function cssName(r: Reading): string {
  return r === 'sleeping_hr' ? 'sleeping-hr' : r
}
