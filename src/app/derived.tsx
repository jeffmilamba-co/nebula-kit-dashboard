// Derived state shared by every view: as-of, snapshots, filters, the visible slice and the follow-up queue.
// Memo chain: model → snapshots(asOf) → filters (from the hash) → visible → follow-up queue.
import { createContext, useCallback, useContext, useDeferredValue, useMemo } from 'react'
import type { ReactNode } from 'react'
import { FILTER_PARAMS, compileFilter, decodeFilters, encodeFilters, filterKey } from '../data/filters.ts'
import { followUpQueue } from '../data/followup.ts'
import { buildSnapshot } from '../data/state.ts'
import { dayEnd } from '../data/time.ts'
import type { Filters, FollowUpItem, Model, OrderSnapshot } from '../data/types.ts'
import { href, navigate, useLocation } from './router.ts'
import type { Loc } from './router.ts'

export interface Derived {
  model: Model
  asOf: number
  asOfOverridden: boolean
  snapshots: OrderSnapshot[]
  snapByOrder: Map<string, OrderSnapshot>
  filters: Filters
  setFilters: (f: Filters) => void
  visible: OrderSnapshot[]
  /** Overdue + at-risk items for the visible slice, most overdue first. */
  followUps: FollowUpItem[]
  overdueCount: number
  atRiskCount: number
  loc: Loc
  params: URLSearchParams
  /** Link that keeps the current filters and as-of. */
  linkTo: (path: string, extra?: Record<string, string | null>) => string
  /** Merge params into the current URL (replace, so Back skips filter tweaks). */
  setQuery: (updates: Record<string, string | null>) => void
}

const DerivedContext = createContext<Derived | null>(null)
const KEEP_PARAMS = [...FILTER_PARAMS, 'asof']

export function DerivedProvider({ model, children }: { model: Model; children: ReactNode }) {
  const loc = useLocation()
  const params = useMemo(() => new URLSearchParams(loc.query), [loc.query])

  const asOfParam = params.get('asof')
  const asOf = useMemo(() => {
    if (asOfParam && /^\d{4}-\d{2}-\d{2}$/.test(asOfParam)) return Math.min(dayEnd(asOfParam), model.maxTimestamp)
    return model.maxTimestamp
  }, [asOfParam, model])

  const snapshots = useMemo(() => buildSnapshot(model, asOf), [model, asOf])
  const snapByOrder = useMemo(() => new Map(snapshots.map((s) => [s.rec.order.orderId, s])), [snapshots])

  // Re-decode only when filter params change (keyed on fKey), not on every query change
  // such as search or paging — so the filtered slice keeps its identity.
  const fKey = filterKey(params)
  const filters = useMemo(() => decodeFilters(new URLSearchParams(loc.query), model.options), [fKey, model])
  const deferredFilters = useDeferredValue(filters)
  const visible = useMemo(() => {
    const pred = compileFilter(deferredFilters)
    return snapshots.filter((s) => pred(s.rec.order))
  }, [snapshots, deferredFilters])

  const followUps = useMemo(() => followUpQueue(visible, { includeAtRisk: true }), [visible])
  const overdueCount = useMemo(() => followUps.filter((i) => i.snap.health === 'overdue').length, [followUps])

  const keep = useMemo(() => {
    const p = new URLSearchParams()
    for (const k of KEEP_PARAMS) {
      const v = params.get(k)
      if (v != null) p.set(k, v)
    }
    return p
  }, [params])

  const linkTo = useCallback(
    (path: string, extra?: Record<string, string | null>) => {
      const p = new URLSearchParams(keep)
      for (const [k, v] of Object.entries(extra ?? {})) {
        if (v == null) p.delete(k)
        else p.set(k, v)
      }
      return href(path, p)
    },
    [keep],
  )

  const setQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const p = new URLSearchParams(params)
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === '') p.delete(k)
        else p.set(k, v)
      }
      navigate(loc.path, p, { replace: true })
    },
    [params, loc.path],
  )

  const setFilters = useCallback(
    (f: Filters) => {
      const p = encodeFilters(f, model.options, params)
      p.delete('page')
      navigate(loc.path, p, { replace: true })
    },
    [model.options, params, loc.path],
  )

  const value = useMemo<Derived>(
    () => ({
      model,
      asOf,
      asOfOverridden: asOf !== model.maxTimestamp,
      snapshots,
      snapByOrder,
      filters,
      setFilters,
      visible,
      followUps,
      overdueCount,
      atRiskCount: followUps.length - overdueCount,
      loc,
      params,
      linkTo,
      setQuery,
    }),
    [model, asOf, snapshots, snapByOrder, filters, setFilters, visible, followUps, overdueCount, loc, params, linkTo, setQuery],
  )
  return <DerivedContext.Provider value={value}>{children}</DerivedContext.Provider>
}

export function useDerived(): Derived {
  const ctx = useContext(DerivedContext)
  if (!ctx) throw new Error('useDerived must be used inside <DerivedProvider>')
  return ctx
}
