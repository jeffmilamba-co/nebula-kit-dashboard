import { useMemo, useState } from 'react'
import { useDerived } from '../app/derived.tsx'
import { NO_KIT_PRODUCTS, TRANSITIONS } from '../data/config.ts'
import type { TransitionInfo } from '../data/config.ts'
import { quantile, sortAsc, stageStats } from '../data/stats.ts'
import { elapsedDays } from '../data/time.ts'
import type { StageStats } from '../data/types.ts'
import { MainWithRail } from '../layout/Columns.tsx'
import { SERIES, productColor } from '../lib/colors.ts'
import { fmtDays, fmtInt, fmtPct, productLabel } from '../lib/format.ts'
import { pillClass } from '../ui/Button.tsx'
import { Card, CardHeader } from '../ui/Card.tsx'

interface Group {
  key: string
  label: string
  color: string
  stats: StageStats[]
}

/** Bullet bar: solid to the median, lighter to p90, dark tick at the target. */
function BulletBar({ s, target, max, color }: { s: StageStats; target: number; max: number; color: string }) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  return (
    <div
      className="relative h-4"
      role="img"
      aria-label={`Median ${fmtDays(s.median)}, 90th percentile ${fmtDays(s.p90)}, target ${target} days`}
    >
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#efede8]" />
      {s.p90 != null && (
        <div className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-r" style={{ width: pct(s.p90), backgroundColor: color, opacity: 0.32 }} />
      )}
      {s.median != null && (
        <div className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-r" style={{ width: pct(s.median), backgroundColor: color }} />
      )}
      <div className="absolute top-0 h-4 w-[2px] rounded-full bg-ink" style={{ left: `calc(${pct(target)} - 1px)` }} title={`Target ${target} d`} />
    </div>
  )
}

function TransitionBlock({ info, groups, overall }: { info: TransitionInfo; groups: Group[]; overall: StageStats }) {
  const rows = groups.map((g) => ({ g, s: g.stats.find((x) => x.key === info.key) })).filter((r): r is { g: Group; s: StageStats } => !!r.s)
  const maxP90 = Math.max(0, ...rows.map((r) => r.s.p90 ?? 0))
  const scaleMax = Math.max(info.target * 1.5, maxP90 * 1.08)
  return (
    <div className="border-t border-line px-4 py-3">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold">{info.label}</h3>
        <span className="text-xs text-ink-2">
          Target {info.target} d{info.assumed ? ' (our assumption)' : ''}
        </span>
      </div>
      {rows.map(({ g, s }) => (
        <div
          key={g.key}
          className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 py-1 sm:grid-cols-[88px_minmax(0,1fr)_minmax(0,300px)]"
        >
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: g.color }} aria-hidden />
            {g.label}
          </span>
          {s.n > 0 ? <BulletBar s={s} target={info.target} max={scaleMax} color={g.color} /> : <span className="text-xs text-ink-3">No completed steps</span>}
          <span className="col-span-2 text-xs text-ink-2 tabular-nums sm:col-span-1 sm:text-right">
            {s.n > 0 ? (
              <>
                median <b className="text-ink">{fmtDays(s.median)}</b> · p90 {fmtDays(s.p90)} · {fmtPct(s.withinTargetPct)} on time ·{' '}
                <span className="whitespace-nowrap">n {fmtInt(s.n)}</span>
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
      ))}
      <p className="mt-1 text-xs text-ink-2">
        Waiting in this step now: <b className="text-ink">{fmtInt(overall.openNow)}</b>
        {overall.overdueNow > 0 && (
          <>
            {' '}
            · <span className="font-semibold text-danger">{fmtInt(overall.overdueNow)} past target</span>
          </>
        )}{' '}
        · SLA {fmtPct(overall.slaPct)}
      </p>
    </div>
  )
}

export function TurnaroundView() {
  const { visible, model } = useDerived()
  const [mode, setMode] = useState<'product' | 'all'>('product')
  const byProduct = useMemo(() => stageStats(visible, (s) => s.rec.order.product), [visible])
  const overall = useMemo(() => stageStats(visible).get('all') ?? [], [visible])
  const kitProducts = useMemo(
    () => model.options.products.filter((p) => !NO_KIT_PRODUCTS.has(p) && byProduct.has(p)),
    [model, byProduct],
  )

  const groups: Group[] =
    mode === 'product'
      ? kitProducts.map((p) => ({ key: p, label: productLabel(p), color: productColor(p, model.options.products), stats: byProduct.get(p)! }))
      : [{ key: 'all', label: 'All', color: SERIES[0], stats: overall }]

  // End-to-end order → report for finished orders, per product.
  const e2e = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const s of visible) {
      if (s.stage !== 'complete' || s.completedAt == null || s.rec.order.createdAt == null) continue
      const list = m.get(s.rec.order.product) ?? []
      list.push(elapsedDays(s.rec.order.createdAt, s.completedAt))
      m.set(s.rec.order.product, list)
    }
    return new Map([...m].map(([p, list]) => [p, sortAsc(list)]))
  }, [visible])

  // Biggest median gap between products across the brief's seven steps, to answer
  // "does it differ by product?" with numbers. Small samples (n < 30) are skipped: they're mostly noise.
  const gap = useMemo(() => {
    if (kitProducts.length < 2) return null
    let best: { label: string; a: string; b: string; ma: number; mb: number; rel: number } | null = null
    for (const t of TRANSITIONS.filter((x) => !x.assumed)) {
      const meds = kitProducts
        .map((p) => ({ p, s: byProduct.get(p)!.find((x) => x.key === t.key)! }))
        .filter((x) => x.s.n >= 30 && x.s.median != null)
      for (let i = 0; i < meds.length; i++)
        for (let j = i + 1; j < meds.length; j++) {
          const ma = meds[i].s.median!
          const mb = meds[j].s.median!
          const rel = Math.abs(ma - mb) / Math.max(0.01, Math.min(ma, mb))
          if (!best || rel > best.rel) best = { label: t.label, a: meds[i].p, b: meds[j].p, ma, mb, rel }
        }
    }
    return best
  }, [kitProducts, byProduct])

  return (
    <MainWithRail
      rail={
        <Card label="How turnaround is measured">
          <CardHeader title="How it’s measured" />
          <ul className="flex list-disc flex-col gap-2 px-4 pb-4 pl-8 text-xs text-ink-2">
            <li>Each step is timed per kit, from the first scan of one milestone to the first scan of the next, in elapsed days.</li>
            <li>A step is only timed when both scans exist on the same kit. We never bridge across a missing scan.</li>
            <li>
              <b className="text-ink">Median</b> is the solid bar, <b className="text-ink">p90</b> the lighter extension and the dark tick is the target.
            </li>
            <li>
              <b className="text-ink">SLA</b> counts kits still waiting past the target as misses. Completed-only numbers hide them: a customer who
              never mails a sample never shows up as “late”.
            </li>
            <li>Order → kit shipped uses the order’s first kit. Replacement kits are timed from the kit_replaced event (3-day target is our assumption).</li>
          </ul>
        </Card>
      }
    >
      <Card label="Stage turnaround">
        <CardHeader
          title="Stage turnaround vs target"
          subtitle="Completed steps for orders matching your filters."
          action={
            <div className="flex gap-1.5" role="group" aria-label="Compare">
              <button type="button" className={pillClass(mode === 'product')} aria-pressed={mode === 'product'} onClick={() => setMode('product')}>
                By product
              </button>
              <button type="button" className={pillClass(mode === 'all')} aria-pressed={mode === 'all'} onClick={() => setMode('all')}>
                Combined
              </button>
            </div>
          }
        />
        <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
          {kitProducts.map((p) => {
            const list = e2e.get(p) ?? []
            return (
              <div key={p} className="bg-surface px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-ink-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: productColor(p, model.options.products) }} aria-hidden />
                  {productLabel(p)} · order → report ready
                </div>
                <div className="mt-1 text-xl font-semibold">{fmtDays(quantile(list, 0.5))}</div>
                <div className="text-xs text-ink-2">
                  median · p90 {fmtDays(quantile(list, 0.9))} · {fmtInt(list.length)} finished orders
                </div>
              </div>
            )
          })}
        </div>
        {gap && (
          <p className="border-t border-line bg-[#f8fafd] px-4 py-2.5 text-xs text-ink-2">
            <b className="text-ink">By product:</b> across the seven pipeline steps, the largest median gap is in “{gap.label}”:{' '}
            {productLabel(gap.a)} {fmtDays(gap.ma)} vs{' '}
            {productLabel(gap.b)} {fmtDays(gap.mb)} ({fmtPct(gap.rel)}).{' '}
            {gap.rel < 0.15 ? 'Products move through the pipeline at essentially the same pace.' : 'Check the rows below for where they diverge.'}
          </p>
        )}
        {kitProducts.length === 0 ? (
          <p className="border-t border-line px-4 py-6 text-sm text-ink-2">
            No kit orders match the current filters. Upload-only orders have no kit, so they have no stage turnaround.
          </p>
        ) : (
          TRANSITIONS.map((t) => <TransitionBlock key={t.key} info={t} groups={groups} overall={overall.find((s) => s.key === t.key)!} />)
        )}
      </Card>
    </MainWithRail>
  )
}
