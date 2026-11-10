import { Download, X } from 'lucide-react'
import { useMemo } from 'react'
import { useDerived } from '../app/derived.tsx'
import { OWNERS, OWNER_LABEL, STAGES } from '../data/config.ts'
import type { FollowUpItem, Owner, Stage } from '../data/types.ts'
import { RailWithMain } from '../layout/Columns.tsx'
import { downloadCsv } from '../lib/download.ts'
import { countryLabel, fmtAge, fmtDate, fmtInt, productLabel } from '../lib/format.ts'
import { Badge } from '../ui/Badge.tsx'
import { Button, pillClass } from '../ui/Button.tsx'
import { Card } from '../ui/Card.tsx'
import { StageIcon } from '../ui/StageIcon.tsx'
import { Pagination } from '../ui/Pagination.tsx'

const PAGE_SIZE = 50
const BANDS = [
  { key: '45-60', label: '45–60 d' },
  { key: '60-90', label: '60–90 d' },
  { key: '90+', label: '90+ d' },
] as const

export function FollowUpView() {
  const { followUps, params, setQuery, linkTo, asOf } = useDerived()
  const owner = params.get('owner') as Owner | null
  const stage = params.get('stage') as Stage | null
  const band = params.get('band')
  const withRisk = params.get('risk') === '1'
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)

  const base = useMemo(() => followUps.filter((i) => withRisk || i.snap.health === 'overdue'), [followUps, withRisk])
  const ownerCounts = useMemo(() => {
    const m = new Map<Owner, number>()
    for (const i of base) if (!stage || i.snap.stage === stage) m.set(i.owner, (m.get(i.owner) ?? 0) + 1)
    return m
  }, [base, stage])
  const items = useMemo(
    () => base.filter((i) => (!owner || i.owner === owner) && (!stage || i.snap.stage === stage) && (!band || i.ageBand === band)),
    [base, owner, stage, band],
  )
  const bandCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of base) if (i.ageBand && (!owner || i.owner === owner)) m.set(i.ageBand, (m.get(i.ageBand) ?? 0) + 1)
    return m
  }, [base, owner])
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const total = (stage ? base.filter((i) => i.snap.stage === stage) : base).length

  const exportCsv = () =>
    downloadCsv(
      `follow-up-${new Date(asOf).toISOString().slice(0, 10)}.csv`,
      ['order_id', 'kit_id', 'product', 'country', 'stage', 'waiting_for', 'waiting_since_utc', 'days_waiting', 'target_days', 'days_over', 'health', 'owner', 'next_step'],
      items.map((i: FollowUpItem) => {
        const s = i.snap
        return [
          s.rec.order.orderId,
          s.currentKit?.kitId ?? '',
          s.rec.order.product,
          s.rec.order.country,
          STAGES[s.stage].label,
          STAGES[s.stage].waitingFor,
          s.clockStart != null ? new Date(s.clockStart).toISOString() : '',
          s.ageDays?.toFixed(1) ?? '',
          s.targetDays,
          i.overdueDays.toFixed(1),
          s.health,
          OWNER_LABEL[i.owner],
          i.action,
        ]
      }),
    )

  const queueRow = (key: Owner | null, label: string, count: number) => {
    const active = owner === key
    return (
      <li key={label}>
        <button
          type="button"
          onClick={() => setQuery({ owner: key, band: null, page: null })}
          aria-current={active ? 'true' : undefined}
          className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-hover ${
            active ? 'font-semibold text-ink shadow-[inset_3px_0_0_var(--color-brand)]' : 'text-ink-2'
          }`}
        >
          {label}
          <span className="tabular-nums">{fmtInt(count)}</span>
        </button>
      </li>
    )
  }

  return (
    <RailWithMain
      rail={
        <Card label="Follow-up queues">
          <div className="px-4 pt-3 pb-2">
            <h2 className="text-base font-semibold">Follow-up queues</h2>
            <p className="text-xs text-ink-2">Who needs to act, by owner</p>
          </div>
          <ul className="pb-1">
            {queueRow(null, 'Everyone', [...ownerCounts.values()].reduce((a, b) => a + b, 0))}
            {OWNERS.map((o) => queueRow(o.key, o.label, ownerCounts.get(o.key) ?? 0))}
          </ul>
          <label className="flex cursor-pointer items-start gap-2 rounded-b-lg border-t border-line px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[#0a66c2]"
              checked={withRisk}
              onChange={(e) => setQuery({ risk: e.target.checked ? '1' : null, page: null })}
            />
            <span>
              Include at-risk
              <span className="block text-xs text-ink-2">≥80% of the stage target, not yet overdue</span>
            </span>
          </label>
        </Card>
      }
    >
      <Card label="Orders needing follow-up">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div>
            <h1 className="text-xl font-semibold">
              {items.length === 0 ? 'Nothing to follow up' : `${fmtInt(items.length)} orders need follow-up`}
            </h1>
            <p className="text-xs text-ink-2">
              Paid orders whose current step has run past its target{withRisk ? ' or is close to it' : ''}. Most overdue first, relative to the
              target.
            </p>
          </div>
          <Button variant="secondary" onClick={exportCsv} disabled={items.length === 0}>
            <Download size={16} aria-hidden /> Export CSV
          </Button>
        </div>
        {(stage || owner === 'customer_care' || (!owner && bandCounts.size > 0)) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            {stage && (
              <button type="button" className={pillClass(true)} onClick={() => setQuery({ stage: null, page: null })}>
                Stage: {STAGES[stage]?.label ?? stage}
                <X size={14} aria-label="Remove stage filter" />
              </button>
            )}
            {(owner === 'customer_care' || !owner) &&
              bandCounts.size > 0 &&
              BANDS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={pillClass(band === b.key)}
                  aria-pressed={band === b.key}
                  onClick={() => setQuery({ band: band === b.key ? null : b.key, page: null })}
                >
                  With customer {b.label} · {fmtInt(bandCounts.get(b.key) ?? 0)}
                </button>
              ))}
          </div>
        )}
        {items.length === 0 ? (
          <p className="border-t border-line px-4 py-6 text-sm text-ink-2">
            {total === 0 ? 'No paid orders are past their stage targets with the current filters.' : 'No orders match this queue.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-ink-2">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Order</th>
                    <th className="px-2 py-2 font-semibold">Waiting for</th>
                    <th className="px-2 py-2 text-right font-semibold">Waited</th>
                    <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">Over target</th>
                    <th className="px-4 py-2 font-semibold">Owner · next step</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((i) => {
                    const s = i.snap
                    const o = s.rec.order
                    return (
                      <tr key={o.orderId} className="border-t border-line align-top hover:bg-[#f8f8f7]">
                        <td className="px-4 py-2.5">
                          <a href={linkTo(`/orders/${encodeURIComponent(o.orderId)}`)} className="font-semibold text-brand hover:underline">
                            {o.orderId}
                          </a>
                          <div className="text-xs text-ink-2">
                            {productLabel(o.product)} · {countryLabel(o.country)}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <StageIcon stage={s.stage} size={14} className="text-ink-2" />
                            {STAGES[s.stage].waitingFor}
                          </div>
                          <div className="text-xs text-ink-2">
                            {STAGES[s.stage].label} since {s.clockStart != null ? fmtDate(s.clockStart) : '—'}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap tabular-nums">
                          {fmtAge(s.ageDays)}
                          <div className="text-xs text-ink-2">target {s.targetDays} d</div>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {s.health === 'overdue' ? (
                            <span className="font-semibold text-danger">+{fmtAge(i.overdueDays)}</span>
                          ) : (
                            <Badge tone="warning">At risk</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs font-semibold">{OWNER_LABEL[i.owner]}</div>
                          <div className="text-xs text-ink-2">{i.action}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={items.length} onPage={(p) => setQuery({ page: p === 1 ? null : String(p) })} />
          </>
        )}
      </Card>
    </RailWithMain>
  )
}
