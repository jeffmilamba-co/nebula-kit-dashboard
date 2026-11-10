import { STAGES, TARGET_DAYS, TRANSITIONS } from './config.ts'
import type { OrderSnapshot, StageStats, TransitionKey } from './types.ts'

/**
 * Ascending copy as a Float64Array. Typed arrays sort numerically in native code, several times
 * faster than Array#sort with a comparator callback; these lists are re-sorted on every filter change.
 */
export function sortAsc(values: readonly number[]): Float64Array {
  return Float64Array.from(values).sort()
}

/** Quantile of an ascending-sorted array, linear interpolation between ranks (R-7, as in Excel/NumPy). */
export function quantile(sortedAsc: ArrayLike<number>, q: number): number | null {
  if (sortedAsc.length === 0) return null
  const pos = (sortedAsc.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo)
}

interface Acc {
  durations: Map<TransitionKey, number[]>
  within: Map<TransitionKey, number>
  open: Map<TransitionKey, number>
  overdue: Map<TransitionKey, number>
}

const inc = (m: Map<TransitionKey, number>, k: TransitionKey) => m.set(k, (m.get(k) ?? 0) + 1)

/**
 * Turnaround stats per transition, optionally grouped (e.g. by product).
 * Completed transitions give n / median / p90 / % within target; orders currently
 * waiting in a stage give "open now" and "overdue now", which feed the SLA %.
 */
export function stageStats(
  snaps: OrderSnapshot[],
  groupBy: (s: OrderSnapshot) => string = () => 'all',
): Map<string, StageStats[]> {
  const groups = new Map<string, Acc>()
  const accFor = (g: string) => {
    let acc = groups.get(g)
    if (!acc) {
      acc = { durations: new Map(), within: new Map(), open: new Map(), overdue: new Map() }
      groups.set(g, acc)
    }
    return acc
  }
  for (const s of snaps) {
    const acc = accFor(groupBy(s))
    for (const t of s.transitions) {
      let list = acc.durations.get(t.key)
      if (!list) acc.durations.set(t.key, (list = []))
      list.push(t.days)
      if (t.withinTarget) inc(acc.within, t.key)
    }
    const waitingOn = STAGES[s.stage].transition
    if (s.actionable && waitingOn) {
      inc(acc.open, waitingOn)
      if (s.health === 'overdue') inc(acc.overdue, waitingOn)
    }
  }
  const out = new Map<string, StageStats[]>()
  for (const [g, acc] of groups) {
    out.set(
      g,
      TRANSITIONS.map(({ key }) => {
        const d = sortAsc(acc.durations.get(key) ?? [])
        const within = acc.within.get(key) ?? 0
        const overdueNow = acc.overdue.get(key) ?? 0
        const denom = d.length + overdueNow
        return {
          key,
          targetDays: TARGET_DAYS[key],
          n: d.length,
          median: quantile(d, 0.5),
          p90: quantile(d, 0.9),
          max: d.length ? d[d.length - 1] : null,
          withinTargetPct: d.length ? within / d.length : null,
          openNow: acc.open.get(key) ?? 0,
          overdueNow,
          slaPct: denom ? within / denom : null,
        }
      }),
    )
  }
  return out
}
