import { ChartColumn, CircleCheck, Table2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDerived } from '../app/derived.tsx'
import { exclusions, kpis, stageDistribution, weeklyVolume } from '../data/metrics.ts'
import type { StageRow } from '../data/metrics.ts'
import type { Health } from '../data/types.ts'
import { DataNotesCard, DatasetCard, FollowUpPreview } from '../layout/RailCards.tsx'
import { ThreeColumn } from '../layout/Columns.tsx'
import { HEALTH_COLOR, HEALTH_LABEL, productColor } from '../lib/colors.ts'
import { fmtDate, fmtDays, fmtDay, fmtInt, fmtPct, fmtShortDay, productLabel, statusLabel } from '../lib/format.ts'
import { Button } from '../ui/Button.tsx'
import { HealthIcon } from '../ui/Badge.tsx'
import { Card, CardHeader, Legend } from '../ui/Card.tsx'
import { StageIcon } from '../ui/StageIcon.tsx'

function Stat({
  label,
  value,
  sub,
  href,
  icon,
  className = '',
}: {
  label: string
  value: string
  sub: ReactNode
  href?: string
  icon?: ReactNode
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-center gap-1 text-xs text-ink-2">
        {label}
        {icon}
      </div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-ink-2">{sub}</div>
    </>
  )
  const cls = `bg-surface px-4 py-3 ${className}`
  return href ? (
    <a href={href} className={`${cls} hover:bg-[#f8f8f7]`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function KpiCard() {
  const { visible, snapshots, filters, asOf, linkTo } = useDerived()
  const k = useMemo(() => kpis(visible), [visible])
  const ex = useMemo(() => exclusions(snapshots, visible, filters), [snapshots, visible, filters])
  const hidden = [
    ...Object.entries(ex.byStatus).map(([s, n]) => `${fmtInt(n)} ${statusLabel(s).toLowerCase()}`),
    ex.test ? `${fmtInt(ex.test)} test` : null,
    ex.other ? `${fmtInt(ex.other)} outside the other filters` : null,
  ].filter(Boolean)
  return (
    <Card label="Pipeline at a glance">
      <CardHeader title="Pipeline at a glance" subtitle={`Orders matching your filters, as of ${fmtDate(asOf)}`} />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-lg border-t border-line bg-line sm:grid-cols-6">
        <Stat
          className="sm:col-span-2"
          label="Orders"
          value={fmtInt(k.orders)}
          sub={`${fmtInt(k.kitOrders)} kit · ${fmtInt(k.noKitOrders)} upload-only`}
        />
        <Stat className="sm:col-span-2" label="In the pipeline" value={fmtInt(k.inPipeline)} sub="Paid kit orders moving now" />
        <Stat
          className="sm:col-span-2"
          label="Reports ready"
          value={fmtInt(k.finished)}
          sub={`${fmtPct(k.finishedPct)} of kit orders`}
        />
        <Stat
          className="sm:col-span-3"
          label="Need follow-up"
          icon={k.overdue > 0 ? <TriangleAlert size={12} className="text-danger" aria-hidden /> : undefined}
          value={fmtInt(k.overdue)}
          sub={`Past target · ${fmtInt(k.atRisk)} more at risk`}
          href={linkTo('/follow-up')}
        />
        <Stat
          className="col-span-2 sm:col-span-3"
          label="Order → report ready"
          value={fmtDays(k.medianOrderToReport)}
          sub="Median for finished orders"
        />
      </div>
      {hidden.length > 0 && (
        <p className="border-t border-line px-4 py-2 text-xs text-ink-2">
          Not shown: {hidden.join(' · ')} orders. Change this with the filters above.
        </p>
      )}
    </Card>
  )
}

const HEALTH_ORDER: Health[] = ['on_track', 'at_risk', 'overdue', 'closed']
const ROW_KEY: Record<Health, keyof StageRow> = { on_track: 'onTrack', at_risk: 'atRisk', overdue: 'overdue', closed: 'closed' }

function StageBar({ row, max }: { row: StageRow; max: number }) {
  const segs = HEALTH_ORDER.map((h) => ({ h, n: row[ROW_KEY[h]] as number })).filter((s) => s.n > 0)
  const width = row.total ? Math.max((row.total / max) * 100, 1.5) : 0
  return (
    <div className="relative h-3 w-full">
      <div className="flex h-full gap-[2px]" style={{ width: `${width}%` }}>
        {segs.map((s, i) => (
          <div
            key={s.h}
            className={i === segs.length - 1 ? 'rounded-r' : ''}
            style={{ flexGrow: s.n, flexBasis: 0, minWidth: 3, backgroundColor: HEALTH_COLOR[s.h] }}
          />
        ))}
      </div>
      {/* Hover / focus tooltip: values lead, labels follow. */}
      <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-max rounded-md bg-surface px-3 py-2 text-xs shadow-pop group-hover:block group-focus-visible:block">
        <div className="mb-1 font-semibold">{row.label}</div>
        {HEALTH_ORDER.filter((h) => (row[ROW_KEY[h]] as number) > 0).map((h) => (
          <div key={h} className="flex items-center gap-2">
            <span className="h-[2px] w-3" style={{ backgroundColor: HEALTH_COLOR[h] }} aria-hidden />
            <b className="tabular-nums">{fmtInt(row[ROW_KEY[h]] as number)}</b>
            <span className="text-ink-2">{HEALTH_LABEL[h].toLowerCase()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WhereNowCard() {
  const { visible, linkTo } = useDerived()
  const rows = useMemo(() => stageDistribution(visible), [visible])
  const finished = useMemo(() => visible.filter((s) => s.stage === 'complete').length, [visible])
  const max = Math.max(1, ...rows.map((r) => r.total))
  const showClosed = rows.some((r) => r.closed > 0)
  return (
    <Card label="Where kits are now">
      <CardHeader
        title="Where kits are now"
        subtitle="Orders waiting in each stage. Color shows time waited against that stage’s target. Select a stage to see who needs a nudge."
      />
      <Legend
        items={HEALTH_ORDER.filter((h) => h !== 'closed' || showClosed).map((h) => ({
          color: HEALTH_COLOR[h],
          label: h === 'at_risk' ? 'At risk (≥80% of target)' : HEALTH_LABEL[h],
          icon: <HealthIcon health={h} size={12} />,
        }))}
      />
      <ul className="px-2 pb-2">
        {rows.map((r) => (
          <li key={r.stage}>
            <a
              href={linkTo('/follow-up', { stage: r.stage, risk: '1' })}
              aria-label={`${r.label}: ${r.total} orders — ${r.onTrack} on track, ${r.atRisk} at risk, ${r.overdue} overdue`}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 hover:bg-hover sm:grid-cols-[170px_minmax(0,1fr)_auto]"
            >
              <span className="flex items-center gap-2 text-sm text-ink">
                <StageIcon stage={r.stage} size={16} className="shrink-0 text-ink-2" />
                {r.label}
              </span>
              <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                <StageBar row={r} max={max} />
              </span>
              <span className="text-right text-sm whitespace-nowrap tabular-nums">
                <b>{fmtInt(r.total)}</b>
                {r.overdue > 0 && <span className="ml-1.5 text-xs font-semibold text-danger">{fmtInt(r.overdue)} overdue</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 rounded-b-lg border-t border-line px-4 py-3 text-sm">
        <CircleCheck size={16} className="text-success" aria-hidden />
        <span>
          <b>{fmtInt(finished)}</b> orders have their report ready
        </span>
      </div>
    </Card>
  )
}

/** Clean, round y-axis ticks (0 / 50 / 100 …) instead of the chart library's arbitrary steps. */
function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow)
  const ticks: number[] = []
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v))
  return ticks
}

function VolumeCard() {
  const { visible, model } = useDerived()
  const [asTable, setAsTable] = useState(false)
  const weeks = useMemo(() => weeklyVolume(visible), [visible])
  const products = model.options.products.filter((p) => weeks.some((w) => w.counts[p]))
  const data = weeks.map((w) => ({ week: w.week, total: w.total, ...Object.fromEntries(products.map((p) => [p, w.counts[p] ?? 0])) }))
  const byWeek = new Map(weeks.map((w) => [w.week, w]))
  const yTicks = niceTicks(Math.max(0, ...weeks.map((w) => w.total)))

  return (
    <Card label="Orders placed per week">
      <CardHeader
        title="Orders placed per week"
        subtitle="By product. Weeks start Monday (UTC); the first and last weeks may be partial."
        action={
          <Button variant="tertiary" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
            {asTable ? <ChartColumn size={16} aria-hidden /> : <Table2 size={16} aria-hidden />}
            {asTable ? 'Chart' : 'Table'}
          </Button>
        }
      />
      {weeks.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-ink-2">No orders match the current filters.</p>
      ) : asTable ? (
        <div className="max-h-[320px] overflow-auto px-4 pb-3">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-surface text-left text-xs text-ink-2">
              <tr>
                <th className="py-1.5 font-semibold">Week of</th>
                {products.map((p) => (
                  <th key={p} className="py-1.5 text-right font-semibold">
                    {productLabel(p)}
                  </th>
                ))}
                <th className="py-1.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week} className="border-t border-line">
                  <td className="py-1.5">{fmtDay(w.week)}</td>
                  {products.map((p) => (
                    <td key={p} className="py-1.5 text-right">
                      {fmtInt(w.counts[p] ?? 0)}
                    </td>
                  ))}
                  <td className="py-1.5 text-right font-semibold">{fmtInt(w.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Legend items={products.map((p) => ({ color: productColor(p, model.options.products), label: productLabel(p) }))} />
          <div className="h-[240px] px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="#e1e0d9" />
                <XAxis
                  dataKey="week"
                  tickFormatter={(w: string) => fmtShortDay(w)}
                  tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.6)' }}
                  tickLine={false}
                  axisLine={{ stroke: '#c3c2b7' }}
                  minTickGap={18}
                />
                <YAxis
                  allowDecimals={false}
                  ticks={yTicks}
                  domain={[0, yTicks[yTicks.length - 1]]}
                  tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.6)' }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  isAnimationActive={false}
                  content={({ active, label }) => {
                    const w = active && typeof label === 'string' ? byWeek.get(label) : undefined
                    if (!w) return null
                    return (
                      <div className="rounded-md bg-surface px-3 py-2 text-xs shadow-pop">
                        <div className="mb-1 font-semibold">Week of {fmtDay(w.week)}</div>
                        {products.map((p) => (
                          <div key={p} className="flex items-center gap-2">
                            <span className="h-[2px] w-3" style={{ backgroundColor: productColor(p, model.options.products) }} aria-hidden />
                            <b className="tabular-nums">{fmtInt(w.counts[p] ?? 0)}</b>
                            <span className="text-ink-2">{productLabel(p)}</span>
                          </div>
                        ))}
                        <div className="mt-1 border-t border-line pt-1">
                          <b className="tabular-nums">{fmtInt(w.total)}</b> <span className="text-ink-2">total</span>
                        </div>
                      </div>
                    )
                  }}
                />
                {products.map((p, i) => (
                  <Bar
                    key={p}
                    dataKey={p}
                    name={productLabel(p)}
                    stackId="volume"
                    fill={productColor(p, model.options.products)}
                    stroke="#ffffff"
                    strokeWidth={1}
                    maxBarSize={24}
                    radius={i === products.length - 1 ? [4, 4, 0, 0] : 0}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  )
}

export function OverviewView() {
  return (
    <ThreeColumn
      left={<DatasetCard />}
      right={
        <>
          <FollowUpPreview />
          <DataNotesCard />
        </>
      }
    >
      <KpiCard />
      <WhereNowCard />
      <VolumeCard />
    </ThreeColumn>
  )
}
