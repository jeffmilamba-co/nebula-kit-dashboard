import { ACTIVE_STAGES, STAGES } from './config.ts'
import { quantile, sortAsc } from './stats.ts'
import { DAY_MS, dayStart, elapsedDays, utcDay, utcWeekStart } from './time.ts'
import type { Filters, OrderSnapshot, Stage } from './types.ts'

export interface Kpis {
  orders: number
  kitOrders: number
  noKitOrders: number
  /** Paid orders with a running clock. */
  inPipeline: number
  finished: number
  finishedPct: number | null
  overdue: number
  atRisk: number
  medianOrderToReport: number | null
  replacedKits: number
}

export function kpis(snaps: OrderSnapshot[]): Kpis {
  let kitOrders = 0
  let noKitOrders = 0
  let inPipeline = 0
  let finished = 0
  let overdue = 0
  let atRisk = 0
  let replacedKits = 0
  const e2e: number[] = []
  for (const s of snaps) {
    if (s.stage === 'no_kit') noKitOrders++
    else kitOrders++
    if (s.actionable) inPipeline++
    if (s.health === 'overdue') overdue++
    else if (s.health === 'at_risk') atRisk++
    for (const k of s.rec.kits) if (k.replacedAt != null) replacedKits++
    if (s.stage === 'complete') {
      finished++
      const created = s.rec.order.createdAt
      if (created != null && s.completedAt != null) e2e.push(elapsedDays(created, s.completedAt))
    }
  }
  return {
    orders: snaps.length,
    kitOrders,
    noKitOrders,
    inPipeline,
    finished,
    finishedPct: kitOrders ? finished / kitOrders : null,
    overdue,
    atRisk,
    medianOrderToReport: quantile(sortAsc(e2e), 0.5),
    replacedKits,
  }
}

export interface StageRow {
  stage: Stage
  label: string
  onTrack: number
  atRisk: number
  overdue: number
  closed: number
  total: number
}

/** Where orders are right now, per active stage, split by health. */
export function stageDistribution(snaps: OrderSnapshot[]): StageRow[] {
  const rows = new Map<Stage, StageRow>(
    ACTIVE_STAGES.map((stage) => [stage, { stage, label: STAGES[stage].label, onTrack: 0, atRisk: 0, overdue: 0, closed: 0, total: 0 }]),
  )
  for (const s of snaps) {
    const row = rows.get(s.stage)
    if (!row) continue
    row.total++
    if (s.health === 'overdue') row.overdue++
    else if (s.health === 'at_risk') row.atRisk++
    else if (s.health === 'closed') row.closed++
    else row.onTrack++
  }
  return [...rows.values()]
}

export interface WeekRow {
  week: string
  total: number
  counts: Record<string, number>
}

/** Orders placed per UTC week (Monday start), split by product; empty weeks are filled in. */
export function weeklyVolume(snaps: OrderSnapshot[]): WeekRow[] {
  const byWeek = new Map<string, WeekRow>()
  for (const s of snaps) {
    const created = s.rec.order.createdAt
    if (created == null) continue
    const week = utcWeekStart(created)
    let row = byWeek.get(week)
    if (!row) byWeek.set(week, (row = { week, total: 0, counts: {} }))
    row.total++
    row.counts[s.rec.order.product] = (row.counts[s.rec.order.product] ?? 0) + 1
  }
  const weeks = [...byWeek.keys()].sort()
  if (weeks.length === 0) return []
  const out: WeekRow[] = []
  for (let t = dayStart(weeks[0]); t <= dayStart(weeks[weeks.length - 1]); t += 7 * DAY_MS) {
    const week = utcDay(t)
    out.push(byWeek.get(week) ?? { week, total: 0, counts: {} })
  }
  return out
}

export interface Exclusions {
  total: number
  test: number
  byStatus: Record<string, number>
  other: number
}

/** What the current filters hide, so the default "paid, no test orders" view is explicit. */
export function exclusions(all: OrderSnapshot[], visible: OrderSnapshot[], f: Filters): Exclusions {
  const shown = new Set(visible)
  const out: Exclusions = { total: 0, test: 0, byStatus: {}, other: 0 }
  const statuses = f.statuses ? new Set(f.statuses) : null
  for (const s of all) {
    if (shown.has(s)) continue
    out.total++
    const o = s.rec.order
    if (o.isTest && !f.includeTest) out.test++
    else if (statuses && !statuses.has(o.status)) out.byStatus[o.status] = (out.byStatus[o.status] ?? 0) + 1
    else out.other++
  }
  return out
}
