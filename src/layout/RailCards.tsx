import { Dna, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useData } from '../app/DataProvider.tsx'
import { useDerived } from '../app/derived.tsx'
import { OWNERS, STAGES } from '../data/config.ts'
import { fmtAge, fmtDateTime, fmtInt } from '../lib/format.ts'
import { Button, ButtonLink } from '../ui/Button.tsx'
import { Card, CardFooterLink } from '../ui/Card.tsx'
import { StageIcon } from '../ui/StageIcon.tsx'

/** Left rail "profile card" for the loaded dataset. */
export function DatasetCard() {
  const data = useData()
  const { model, linkTo, asOf } = useDerived()
  const q = model.quality
  const eventsKept = q.eventRows - q.duplicateEvents - q.orphanEvents - q.eventsBadTimestamp - q.eventsMissingFields
  const rows: [string, string][] = [
    ['Orders', fmtInt(q.orderRows - q.duplicateOrderIds - q.ordersMissingId)],
    ['Kits', fmtInt(q.kits)],
    ['Events (cleaned)', fmtInt(eventsKept)],
  ]
  return (
    <Card label="Dataset">
      <div className="h-14 rounded-t-lg bg-[linear-gradient(120deg,#0a66c2_0%,#5b9bd5_55%,#a7c7e7_100%)]" aria-hidden />
      <div className="-mt-9 flex justify-center">
        <div className="flex size-[72px] items-center justify-center rounded-full border-2 border-surface bg-surface text-brand shadow-card">
          <Dna size={36} aria-hidden />
        </div>
      </div>
      <div className="px-3 pt-2 pb-3 text-center">
        <div className="text-base font-semibold">Kit lifecycle data</div>
        <div className="mt-0.5 text-xs break-words text-ink-2">
          {data.isSample ? 'Sample export' : 'Your files'} · {model.source.ordersName} + {model.source.eventsName}
        </div>
      </div>
      <dl className="border-t border-line px-3 py-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between py-1">
            <dt className="text-ink-2">{k}</dt>
            <dd className="font-semibold text-brand tabular-nums">{v}</dd>
          </div>
        ))}
        <div className="py-1">
          <dt className="text-ink-2">Data as of</dt>
          <dd className="font-semibold">{fmtDateTime(asOf)}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2 border-t border-line p-3">
        <ButtonLink href={linkTo('/data')} variant="secondary">
          Load your CSVs
        </ButtonLink>
        {!data.isSample && (
          <Button variant="tertiary" onClick={() => void data.loadSample()}>
            Restore sample data
          </Button>
        )}
      </div>
    </Card>
  )
}

/** Right rail: who needs to act, and the most overdue orders. */
export function FollowUpPreview() {
  const { followUps, overdueCount, atRiskCount, linkTo } = useDerived()
  const overdue = useMemo(() => followUps.filter((i) => i.snap.health === 'overdue'), [followUps])
  const byOwner = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of overdue) m.set(i.owner, (m.get(i.owner) ?? 0) + 1)
    return m
  }, [overdue])
  return (
    <Card label="Needs follow-up">
      <div className="px-4 pt-3 pb-2">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          Needs follow-up
          {overdueCount > 0 && <TriangleAlert size={16} className="text-danger" aria-hidden />}
        </h2>
        <p className="text-xs text-ink-2">
          {fmtInt(overdueCount)} overdue · {fmtInt(atRiskCount)} at risk (paid orders)
        </p>
      </div>
      {overdue.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-ink-2">Nothing is past its target.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5 px-4 pb-2">
            {OWNERS.filter((o) => byOwner.get(o.key)).map((o) => (
              <li key={o.key}>
                <a
                  href={linkTo('/follow-up', { owner: o.key })}
                  className="inline-flex items-center gap-1 rounded-full bg-[#eef0f2] px-2 py-0.5 text-xs font-semibold text-ink-2 hover:bg-[#e2e5e8] hover:text-ink"
                >
                  {o.label} <span className="text-danger tabular-nums">{fmtInt(byOwner.get(o.key) ?? 0)}</span>
                </a>
              </li>
            ))}
          </ul>
          <ul>
            {overdue.slice(0, 5).map((i) => {
              const o = i.snap.rec.order
              return (
                <li key={o.orderId}>
                  <a href={linkTo(`/orders/${encodeURIComponent(o.orderId)}`)} className="flex items-start gap-3 px-4 py-2 hover:bg-hover">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                      <StageIcon stage={i.snap.stage} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{o.orderId}</span>
                      <span className="block text-xs text-ink-2">{STAGES[i.snap.stage].label}</span>
                      <span className="block text-xs text-ink-3">
                        {fmtAge(i.snap.ageDays)} waiting · target {i.snap.targetDays} d
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-danger tabular-nums">+{fmtAge(i.overdueDays)}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <CardFooterLink href={linkTo('/follow-up')}>Show all follow-ups</CardFooterLink>
    </Card>
  )
}

/** Right rail: what was cleaned up (LinkedIn News style list). */
export function DataNotesCard() {
  const { model, linkTo } = useDerived()
  const q = model.quality
  const notes = [
    { n: q.duplicateEvents, title: 'duplicate events merged', sub: 'Same kit, step and instant' },
    { n: q.orphanEvents, title: 'events for unknown orders', sub: 'Not in the orders file: excluded' },
    { n: q.tzCounts.naive, title: 'timestamps without a timezone', sub: 'Read as UTC' },
    { n: q.kitsWithMissingScan, title: 'kits with a skipped scan', sub: 'Furthest step reached counts' },
    { n: q.testOrders, title: 'test orders', sub: 'Hidden unless “Test orders” is on' },
    { n: q.cancelledWithShipments, title: 'kits shipped on cancelled orders', sub: 'Closed: never in follow-up' },
    { n: q.eventsBadTimestamp, title: 'unreadable timestamps', sub: 'Rows dropped' },
  ].filter((x) => x.n > 0)
  return (
    <Card label="Data notes">
      <div className="px-4 pt-3 pb-1">
        <h2 className="text-base font-semibold">Data notes</h2>
        <p className="text-xs text-ink-2">How this export was cleaned before counting</p>
      </div>
      <ul className="px-4 pb-2">
        {notes.map((x) => (
          <li key={x.title} className="flex gap-2 py-1.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-2" aria-hidden />
            <span>
              <span className="block text-sm font-semibold">
                {fmtInt(x.n)} {x.title}
              </span>
              <span className="block text-xs text-ink-2">{x.sub}</span>
            </span>
          </li>
        ))}
        {notes.length === 0 && <li className="py-2 text-sm text-ink-2">No issues found in this export.</li>}
      </ul>
      <CardFooterLink href={linkTo('/data')}>See all data checks</CardFooterLink>
    </Card>
  )
}
