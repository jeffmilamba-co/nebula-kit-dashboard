// Stacked column chart in plain HTML/CSS. It replaced Recharts, which cost ~110 KB (gzipped) on the
// landing page and a measure-then-re-render pass (container size, every tick label) for one chart.
// Percent heights and flex columns lay out with no JavaScript measurement, at any width.
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { fmtInt } from '../lib/format.ts'

export interface ColumnSeries {
  key: string
  label: string
  color: string
}

export interface Column {
  key: string
  values: Record<string, number>
  total: number
}

interface Props {
  /** Accessible name; the chart is also navigable with arrow keys. */
  label: string
  columns: Column[]
  /** Stacked bottom-up in this order (fixed order, so colors never move between segments). */
  series: ColumnSeries[]
  /** Clean y-axis ticks, ascending from 0; the last one is the top of the scale. */
  yTicks: number[]
  xLabel: (key: string) => string
  tooltipTitle: (key: string) => string
  /** Most x-axis labels on a wide chart (half as many below 448px); the rest are thinned out so they never collide. */
  maxXLabels?: number
}

const pct = (v: number, max: number) => `${(v / max) * 100}%`

export function StackedColumnChart({ label, columns, series, yTicks, xLabel, tooltipTitle, maxXLabels = 8 }: Props) {
  const [active, setActive] = useState<number | null>(null)
  const max = yTicks[yTicks.length - 1] || 1
  const labelEvery = Math.max(1, Math.ceil(columns.length / maxXLabels))
  const n = columns.length

  const onKeyDown = (e: KeyboardEvent) => {
    const last = n - 1
    const next =
      e.key === 'ArrowRight' ? Math.min(last, (active ?? -1) + 1)
      : e.key === 'ArrowLeft' ? Math.max(0, (active ?? n) - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : e.key === 'Escape' ? null
      : undefined
    if (next === undefined) return
    e.preventDefault()
    setActive(next)
  }

  const col = active == null ? null : columns[active]
  return (
    // @container: the label density follows the chart's own width, not the viewport.
    <div className="@container flex h-full flex-col">
      <div className="flex min-h-0 flex-1 pt-2">
        {/* Y axis: tick values centred on their gridlines. */}
        <div className="relative w-10 shrink-0" aria-hidden>
          {yTicks.map((t) => (
            <span
              key={t}
              className="absolute right-2 translate-y-1/2 text-[11px] leading-none tabular-nums text-ink-2"
              style={{ bottom: pct(t, max) }}
            >
              {fmtInt(t)}
            </span>
          ))}
        </div>
        <div
          role="group"
          aria-label={`${label}. Use the arrow keys to read each column.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="relative flex-1 rounded-sm"
        >
          {yTicks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={`absolute inset-x-0 h-px ${t === 0 ? 'bg-health-closed' : 'bg-[#e1e0d9]'}`}
              style={{ bottom: pct(t, max) }}
            />
          ))}
          <div className="absolute inset-0 flex" aria-hidden>
            {columns.map((c, i) => {
              const present = series.filter((s) => (c.values[s.key] ?? 0) > 0)
              return (
                // The whole column slot is the hit target, not just the painted bar.
                <div
                  key={c.key}
                  onPointerEnter={() => setActive(i)}
                  className={`flex h-full flex-1 flex-col-reverse items-center ${i === active ? 'bg-black/[0.04]' : ''}`}
                >
                  {present.map((s, j) => (
                    <div
                      key={s.key}
                      className={`w-[60%] max-w-6 ${j === present.length - 1 ? 'rounded-t' : ''}`}
                      style={{
                        height: pct(c.values[s.key], max),
                        backgroundColor: s.color,
                        // 2px surface-coloured gap above each segment that has one stacked on it.
                        boxShadow: j < present.length - 1 ? 'inset 0 2px 0 0 var(--color-surface)' : undefined,
                      }}
                    />
                  ))}
                </div>
              )
            })}
          </div>
          {col && active != null && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 rounded-md bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-pop"
              style={{
                left: pct(active + 0.5, n),
                transform: active < n * 0.25 ? 'translateX(8px)' : active > n * 0.75 ? 'translateX(calc(-100% - 8px))' : 'translateX(-50%)',
              }}
            >
              <div className="mb-1 font-semibold">{tooltipTitle(col.key)}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="h-[2px] w-3" style={{ backgroundColor: s.color }} aria-hidden />
                  <b className="tabular-nums">{fmtInt(col.values[s.key] ?? 0)}</b>
                  <span className="text-ink-2">{s.label}</span>
                </div>
              ))}
              <div className="mt-1 border-t border-line pt-1">
                <b className="tabular-nums">{fmtInt(col.total)}</b> <span className="text-ink-2">total</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* X axis labels: every labelEvery-th on a wide chart, every other one of those on a narrow one. */}
      <div className="ml-10 flex h-5 shrink-0" aria-hidden>
        {columns.map((c, i) => (
          <span key={c.key} className="relative flex-1">
            {i % labelEvery === 0 && (
              // Centred under its column, except at the ends, where centring would push it past the edge.
              <span
                className={`absolute bottom-0 text-[11px] leading-none whitespace-nowrap text-ink-2 ${i % (labelEvery * 2) === 0 ? '' : 'hidden @md:block'} ${
                  i === 0 ? 'left-0' : i === n - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                }`}
              >
                {xLabel(c.key)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
