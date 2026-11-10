import { ClipboardList, Search, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useDerived } from '../app/derived.tsx'
import { STAGES } from '../data/config.ts'
import type { OrderSnapshot } from '../data/types.ts'
import { countryLabel, fmtAge, fmtDate, fmtDateTime, fmtInt, productLabel, statusLabel } from '../lib/format.ts'
import { HealthIcon } from '../ui/Badge.tsx'
import { Card } from '../ui/Card.tsx'
import { Pagination } from '../ui/Pagination.tsx'
import { StageIcon } from '../ui/StageIcon.tsx'
import { OrderDetail } from './OrderDetail.tsx'

const PAGE_SIZE = 25

function matchesTerm(s: OrderSnapshot, term: string): boolean {
  const o = s.rec.order
  return (
    o.orderId.toLowerCase().includes(term) ||
    o.customerId.toLowerCase().includes(term) ||
    s.rec.kits.some((k) => k.kitId.toLowerCase().includes(term))
  )
}

const HEALTH_TEXT = { on_track: 'text-ink-2', at_risk: 'text-warning', overdue: 'text-danger', closed: 'text-ink-3' } as const

export function OrdersView({ orderId }: { orderId: string | null }) {
  const { visible, snapshots, snapByOrder, model, params, setQuery, linkTo } = useDerived()
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const term = q.trim().toLowerCase()
  const [draft, setDraft] = useState(q)
  // Keep the box in sync when the query changes elsewhere (e.g. the top-nav search).
  const [prevQ, setPrevQ] = useState(q)
  if (q !== prevQ) {
    setPrevQ(q)
    setDraft(q)
  }

  const visibleIds = useMemo(() => new Set(visible.map((s) => s.rec.order.orderId)), [visible])
  const list = useMemo(() => {
    const base = term ? visible.filter((s) => matchesTerm(s, term)) : visible
    return [...base].sort((a, b) => (b.rec.order.createdAt ?? 0) - (a.rec.order.createdAt ?? 0))
  }, [visible, term])
  const hiddenMatches = useMemo(
    () => (term ? snapshots.filter((s) => !visibleIds.has(s.rec.order.orderId) && matchesTerm(s, term)).length : 0),
    [snapshots, visibleIds, term],
  )
  const orphanHits = useMemo(
    () => (term ? model.orphans.filter((e) => e.orderId.toLowerCase().includes(term) || e.kitId.toLowerCase().includes(term)) : []),
    [model, term],
  )

  const selected = orderId ? (snapByOrder.get(orderId) ?? null) : null
  const listParams = { q: q || null, page: page > 1 ? String(page) : null }
  const backHref = linkTo('/orders', listParams)
  const pageItems = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const orphanForSelected = orderId && !selected ? model.orphans.filter((e) => e.orderId === orderId || e.kitId === orderId) : []

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    setQuery({ q: draft.trim() || null, page: null })
  }

  return (
    <div className="mx-auto max-w-[1128px] px-0 py-0 sm:px-4 sm:py-6">
      <Card className="grid min-h-[70vh] md:grid-cols-[360px_minmax(0,1fr)]" label="Orders">
        <div className={`${orderId ? 'hidden md:flex' : 'flex'} min-w-0 flex-col md:border-r md:border-line`}>
          <div className="border-b border-line px-4 py-3">
            <form onSubmit={onSearch} role="search" className="relative">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2" aria-hidden />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Filter by order, kit or customer ID"
                aria-label="Filter orders by ID"
                className="h-[34px] w-full rounded bg-search pr-3 pl-9 text-sm placeholder:text-ink-2 focus:bg-surface focus:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.6)] focus:outline-none"
              />
            </form>
            <p className="mt-2 text-xs text-ink-2">
              {fmtInt(list.length)} {list.length === 1 ? 'order' : 'orders'}
              {term ? ` matching “${q.trim()}”` : ' matching your filters'} · newest first
            </p>
            {hiddenMatches > 0 && (
              <p className="mt-1 text-xs text-ink-2">
                {fmtInt(hiddenMatches)} more {hiddenMatches === 1 ? 'match is' : 'matches are'} hidden by the filters above.
              </p>
            )}
            {orphanHits.length > 0 && (
              <p className="mt-2 flex gap-1.5 rounded bg-warning-soft px-2 py-1.5 text-xs text-warning">
                <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden />
                <span>
                  {fmtInt(orphanHits.length)} event{orphanHits.length > 1 ? 's' : ''} in the kit events file match “{q.trim()}” but reference an order
                  that isn’t in the orders file, so {orphanHits.length > 1 ? 'they are' : 'it is'} excluded.{' '}
                  <a className="font-semibold underline" href={linkTo('/data')}>
                    See data checks
                  </a>
                </span>
              </p>
            )}
          </div>
          <ul className="flex-1">
            {pageItems.map((s) => {
              const o = s.rec.order
              const isSel = o.orderId === orderId
              return (
                <li key={o.orderId}>
                  <a
                    href={linkTo(`/orders/${encodeURIComponent(o.orderId)}`, listParams)}
                    aria-current={isSel ? 'true' : undefined}
                    className={`flex gap-3 border-b border-line px-4 py-3 ${
                      isSel ? 'bg-brand-soft shadow-[inset_3px_0_0_var(--color-brand)]' : 'hover:bg-hover'
                    }`}
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded bg-[#eef3f8] text-brand" aria-hidden>
                      <StageIcon stage={s.stage} size={22} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-brand">{o.orderId}</span>
                      <span className="block text-sm text-ink">
                        {productLabel(o.product)} · {countryLabel(o.country)}
                      </span>
                      <span className={`mt-0.5 flex items-center gap-1 text-xs ${s.health ? HEALTH_TEXT[s.health] : 'text-ink-2'}`}>
                        {s.health && <HealthIcon health={s.health} size={12} />}
                        {STAGES[s.stage].label}
                        {s.ageDays != null && ` · ${fmtAge(s.ageDays)}`}
                      </span>
                      <span className="block text-xs text-ink-3">
                        {o.createdAt != null ? `Ordered ${fmtDate(o.createdAt)}` : 'Order date unreadable'}
                        {o.status !== 'paid' && ` · ${statusLabel(o.status)}`}
                        {o.isTest && ' · Test'}
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
            {list.length === 0 && <li className="px-4 py-6 text-sm text-ink-2">No orders match.</li>}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.length} onPage={(p) => setQuery({ page: p === 1 ? null : String(p) })} />
        </div>

        <div className={`${orderId ? 'block' : 'hidden md:block'} min-w-0`}>
          {selected ? (
            <OrderDetail snap={selected} inFilter={visibleIds.has(selected.rec.order.orderId)} backHref={backHref} />
          ) : orderId ? (
            <div className="px-6 py-10">
              <h1 className="text-xl font-semibold break-all">{orderId}</h1>
              {orphanForSelected.length > 0 ? (
                <>
                  <p className="mt-2 text-sm text-ink-2">
                    This ID isn’t in the orders file. The kit events file has {orphanForSelected.length} event
                    {orphanForSelected.length > 1 ? 's' : ''} for it, which are excluded from every metric as orphans:
                  </p>
                  <ul className="mt-2 text-sm">
                    {orphanForSelected.map((e) => (
                      <li key={e.eventId} className="font-mono text-xs">
                        {e.eventId} · {e.kitId} · {e.type} · {fmtDateTime(e.at)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-2">No order with this ID was found in the loaded data.</p>
              )}
              <a href={backHref} className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">
                Back to orders
              </a>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-[#eef3f8] text-brand" aria-hidden>
                <ClipboardList size={32} />
              </span>
              <h2 className="text-lg font-semibold">Select an order</h2>
              <p className="max-w-[320px] text-sm text-ink-2">
                See every kit, scan and replacement for it, how long each step took and what it’s waiting on now.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
