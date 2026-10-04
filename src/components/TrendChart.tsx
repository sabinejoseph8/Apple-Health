import { type KeyboardEvent, type PointerEvent, useState } from 'react'
import type { Reading } from '../../supabase/functions/_shared/briefing'
import { wording } from '../../supabase/functions/_shared/wording'
import { flagged, type TrendPoint } from '../lib/trends'
import { shortNight } from '../lib/when'
import { shortValue } from '../lib/why'
import { cssName } from './MiniChart'

const W = 300
const H = 140
const PAD = 10
const t = wording.trends

// Eight weeks of one reading (design.md, Trend chart): the normal-range band
// as it was each night (D70), normal as a dashed line, nights as a line with
// gaps (R45), nights outside the range as orange dots. Tap a night, or use
// the arrow keys, to read its value and date.
export default function TrendChart({ reading, points, label }: { reading: Reading; points: TrendPoint[]; label: string }) {
  const [picked, setPicked] = useState<number | null>(null)
  const name = cssName(reading)

  const scale = points.flatMap((p) => [p.value, p.low, p.high].filter((v): v is number => v !== null))
  let min = Math.min(...scale)
  let max = Math.max(...scale)
  if (!Number.isFinite(min)) [min, max] = [0, 1]
  if (max - min < 1e-6) [min, max] = [min - 1, max + 1]
  const x = (k: number) => PAD / 2 + (k / Math.max(1, points.length - 1)) * (W - PAD)
  const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD)

  // Runs of consecutive nights that have something to draw.
  const runs = (has: (p: TrendPoint) => boolean) => {
    const out: number[][] = []
    points.forEach((p, k) => {
      if (!has(p)) return
      if (out.length > 0 && out[out.length - 1].at(-1) === k - 1) out[out.length - 1].push(k)
      else out.push([k])
    })
    return out
  }
  const line = (ks: number[], v: (p: TrendPoint) => number) => ks.map((k, i) => `${i === 0 ? 'M' : 'L'}${x(k).toFixed(1)} ${y(v(points[k])).toFixed(1)}`).join('')

  const bands = runs((p) => p.low !== null && p.high !== null).map((ks) => {
    const top = ks.map((k) => `${x(k).toFixed(1)},${y(points[k].high!).toFixed(1)}`)
    const bottom = [...ks].reverse().map((k) => `${x(k).toFixed(1)},${y(points[k].low!).toFixed(1)}`)
    // A single night with a range is drawn as a thin bar.
    return ks.length === 1 ? null : [...top, ...bottom].join(' ')
  })
  const medians = runs((p) => p.median !== null).map((ks) => line(ks, (p) => p.median!))
  const values = runs((p) => p.value !== null).map((ks) => (ks.length === 1 ? `${line(ks, (p) => p.value!)}h0.1` : line(ks, (p) => p.value!)))

  function pick(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const k = Math.round(((e.clientX - box.left) / box.width) * (points.length - 1))
    setPicked(Math.max(0, Math.min(points.length - 1, k)))
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const from = picked ?? points.length - 1
    setPicked(Math.max(0, Math.min(points.length - 1, from + (e.key === 'ArrowLeft' ? -1 : 1))))
  }

  const chosen = picked !== null ? points[picked] : null
  const readout = chosen
    ? chosen.value !== null
      ? t.night(shortNight(chosen.date), shortValue(reading, chosen.value))
      : t.noReading(shortNight(chosen.date))
    : t.hint

  return (
    <figure className="trend-chart">
      <p className="caption trend-readout" aria-live="polite">
        {readout}
      </p>
      <div
        className="trend-plot"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={picked ?? points.length - 1}
        aria-valuetext={readout}
        tabIndex={0}
        onPointerDown={pick}
        onKeyDown={onKey}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true">
          {bands.map((poly, i) => poly && <polygon key={i} points={poly} fill={`var(--${name}-band)`} />)}
          {medians.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={`var(--${name}-median)`} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          ))}
          {values.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={`var(--${name})`} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {points.map((p, k) =>
          flagged(p) ? (
            <span key={p.date} className="trend-dot flagged" style={{ left: `${(x(k) / W) * 100}%`, top: `${y(p.value!)}px` }} />
          ) : null,
        )}
        {chosen && picked !== null && (
          <>
            <span className="trend-guide" style={{ left: `${(x(picked) / W) * 100}%` }} />
            {chosen.value !== null && (
              <span
                className="trend-dot picked"
                style={{ left: `${(x(picked) / W) * 100}%`, top: `${y(chosen.value)}px`, background: `var(--${name})` }}
              />
            )}
          </>
        )}
      </div>
      <figcaption className="mini-chart-labels">
        <span>{t.start}</span>
        <span>{t.end}</span>
      </figcaption>
    </figure>
  )
}
