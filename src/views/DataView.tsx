import { FileUp, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useData } from '../app/DataProvider.tsx'
import { useDerived } from '../app/derived.tsx'
import { navigate } from '../app/router.ts'
import { AT_RISK_SHARE, TRANSITIONS } from '../data/config.ts'
import { utcDay } from '../data/time.ts'
import { MainWithRail } from '../layout/Columns.tsx'
import { fmtDateTime, fmtInt } from '../lib/format.ts'
import { Button } from '../ui/Button.tsx'
import { Card, CardHeader } from '../ui/Card.tsx'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
const list = (r: Record<string, number>) =>
  Object.entries(r)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k.replace(/_/g, ' ')} ${fmtInt(n)}`)
    .join(' · ')

function UploadCard() {
  const data = useData()
  const [errors, setErrors] = useState<string[] | null>(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const handle = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setErrors(null)
    const errs = await data.loadFiles([...files])
    if (errs) setErrors(errs)
    else navigate('/', '')
  }

  return (
    <Card label="Load your own data">
      <CardHeader
        title="Load a different pair of CSVs"
        subtitle="Same columns as the sample exports. Each file is recognized by its headers, so the order you pick them in doesn’t matter."
      />
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void handle(e.dataTransfer.files)
        }}
        className={`mx-4 mb-4 flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? 'border-brand bg-brand-soft' : 'border-line-strong'
        }`}
      >
        <FileUp size={32} className="text-brand" aria-hidden />
        <p className="font-semibold">Drop orders.csv and kit_events.csv here</p>
        <p className="max-w-[420px] text-xs text-ink-2">
          Required columns: orders: order_id, created_at, product, status. Kit events: order_id, kit_id, event_type, occurred_at. Extra
          columns are ignored.
        </p>
        <Button variant="primary" size="md" onClick={() => input.current?.click()} disabled={data.busy}>
          {data.busy ? 'Reading…' : 'Choose two files'}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => {
            void handle(e.target.files)
            e.target.value = ''
          }}
        />
        <p className="text-xs text-ink-3">Files are read in your browser and never uploaded anywhere.</p>
      </div>
      {errors && (
        <div role="alert" className="mx-4 mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          <b>Couldn’t load those files.</b> The current data is still loaded.
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {!data.isSample && (
        <div className="rounded-b-lg border-t border-line px-4 py-3">
          <Button variant="tertiary" onClick={() => void data.loadSample().then(() => navigate('/', ''))}>
            <RotateCcw size={16} aria-hidden /> Restore the sample data
          </Button>
        </div>
      )}
    </Card>
  )
}

function ChecksCard() {
  const { model } = useDerived()
  const q = model.quality
  const checks: { label: string; n: number; how: string; detail?: string }[] = [
    {
      label: 'Duplicate events merged',
      n: q.duplicateEvents,
      how: 'Same order, kit, step and instant, often one time written in two formats. One row is kept; the merged IDs show on the order page.',
    },
    {
      label: 'Events for orders not in the orders file',
      n: q.orphanEvents,
      how: 'Excluded from every metric (listed below).',
      detail: q.orphanOrderIds ? `${fmtInt(q.orphanOrderIds)} order IDs` : undefined,
    },
    {
      label: 'Timestamps without a timezone',
      n: q.tzCounts.naive,
      how: 'Read as UTC. Where the same event also appears with a zone, the two line up exactly under UTC.',
    },
    { label: 'Timestamps with a UTC offset', n: q.tzCounts.offset, how: 'Converted to UTC.' },
    {
      label: 'Unreadable event timestamps',
      n: q.eventsBadTimestamp,
      how: 'Row dropped.',
      detail: q.badTimestampSamples.length ? `e.g. ${q.badTimestampSamples.join(', ')}` : undefined,
    },
    { label: 'Event rows missing order, kit or type', n: q.eventsMissingFields, how: 'Row dropped.' },
    { label: 'Orders with an unreadable order date', n: q.ordersBadDate, how: 'Kept, but left out of date filters and order → ship timing.' },
    { label: 'Duplicate order IDs', n: q.duplicateOrderIds, how: 'First row kept.' },
    {
      label: 'Kits with a skipped scan',
      n: q.kitsWithMissingScan,
      how: 'Status uses the furthest step reached; the steps either side of the gap aren’t timed.',
      detail: list(q.missingScans) || undefined,
    },
    { label: 'Repeat scans of the same step', n: q.repeatedMilestones, how: 'The first scan counts.' },
    {
      label: 'Kits replaced',
      n: q.replacedKits,
      how: 'The old kit closes; the next kit on the order carries on.',
      detail: list(q.replacementReasons) || undefined,
    },
    { label: 'Replaced kits with no replacement shipped yet', n: q.replacedWithoutSuccessor, how: 'Order shows as “Awaiting replacement”.' },
    { label: 'Events after a kit was replaced', n: q.eventsAfterReplacement, how: 'Ignored for status and timing.' },
    { label: 'QC retests', n: q.qcRetests, how: 'The latest QC result counts.' },
    { label: 'Sequencing after a failed QC', n: q.inconsistentQc, how: 'Treated as passed.' },
    { label: 'Kit IDs reused across orders', n: q.kitsOnMultipleOrders, how: 'Treated as separate kits.' },
    { label: 'Events before their order was placed', n: q.eventsBeforeOrder, how: 'Kept; negative durations aren’t timed.' },
    {
      label: 'Unknown event types',
      n: sum(q.unknownEventTypes),
      how: 'Shown on the order page, ignored for status.',
      detail: list(q.unknownEventTypes) || undefined,
    },
    {
      label: 'Unknown products or statuses',
      n: sum(q.unknownProducts) + sum(q.unknownStatuses),
      how: 'Kept. Unknown products are treated as kit products; only paid orders are followed up.',
      detail: list({ ...q.unknownProducts, ...q.unknownStatuses }) || undefined,
    },
    { label: 'Test orders', n: q.testOrders, how: 'Hidden unless “Test orders” is switched on.' },
    { label: 'Kits shipped on cancelled orders', n: q.cancelledWithShipments, how: 'Closed: never followed up.' },
    { label: 'Refunded orders that still got a report', n: q.refundedCompleted, how: 'Closed: counted only when refunded orders are in the Status filter.' },
    { label: 'Upload-only orders with kit events', n: q.uploadOnlyWithEvents, how: 'Treated as kit orders.' },
  ]
  return (
    <Card label="Data checks">
      <CardHeader
        title="Data checks"
        subtitle={`${fmtInt(q.orderRows)} order rows and ${fmtInt(q.eventRows)} event rows read from ${model.source.ordersName} and ${model.source.eventsName}.`}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-t border-line">
              <th className="px-4 py-2 font-semibold">Check</th>
              <th className="px-2 py-2 text-right font-semibold">Found</th>
              <th className="px-4 py-2 font-semibold">How it’s handled</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.label} className={`border-t border-line align-top ${c.n === 0 ? 'text-ink-3' : ''}`}>
                <td className="px-4 py-2">
                  {c.label}
                  {c.detail && c.n > 0 && <div className="text-xs text-ink-2">{c.detail}</div>}
                </td>
                <td className={`px-2 py-2 text-right tabular-nums ${c.n > 0 ? 'font-semibold' : ''}`}>{fmtInt(c.n)}</td>
                <td className="px-4 py-2 text-xs text-ink-2">{c.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function OrphansCard() {
  const { model } = useDerived()
  if (model.orphans.length === 0) return null
  const shown = model.orphans.slice(0, 100)
  return (
    <Card label="Orphan events">
      <CardHeader
        title={`Orphan events (${fmtInt(model.orphans.length)})`}
        subtitle="Kit events whose order_id isn’t in the orders file. They’re excluded from every count."
      />
      <div className="max-h-[360px] overflow-auto rounded-b-lg border-t border-line">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="sticky top-0 bg-surface text-left text-ink-2">
            <tr>
              <th className="px-4 py-2 font-semibold">event_id</th>
              <th className="px-2 py-2 font-semibold">order_id</th>
              <th className="px-2 py-2 font-semibold">kit_id</th>
              <th className="px-2 py-2 font-semibold">event_type</th>
              <th className="px-4 py-2 font-semibold">occurred_at</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {shown.map((e) => (
              <tr key={e.eventId} className="border-t border-line">
                <td className="px-4 py-1.5">{e.eventId}</td>
                <td className="px-2 py-1.5">{e.orderId}</td>
                <td className="px-2 py-1.5">{e.kitId}</td>
                <td className="px-2 py-1.5">{e.type}</td>
                <td className="px-4 py-1.5">{e.raw}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {model.orphans.length > shown.length && <p className="px-4 py-2 text-xs text-ink-2">Showing the first {shown.length}.</p>}
      </div>
    </Card>
  )
}

function RulesCard() {
  const { model, asOf, asOfOverridden, setQuery } = useDerived()
  const latestDay = utcDay(model.maxTimestamp)
  return (
    <Card label="Rules and assumptions">
      <CardHeader title="Rules & assumptions" />
      <div className="flex flex-col gap-3 px-4 pb-4 text-xs text-ink-2">
        <div>
          <div className="font-semibold text-ink">“Now”</div>
          The latest timestamp in the files ({fmtDateTime(model.maxTimestamp)}), not today’s date, because exports can be old.
          <label className="mt-2 flex items-center gap-2">
            <span>View as of</span>
            <input
              type="date"
              className="h-8 rounded border border-line-strong px-2 text-sm text-ink"
              max={latestDay}
              value={asOfOverridden ? utcDay(asOf) : latestDay}
              onChange={(e) => setQuery({ asof: e.target.value && e.target.value !== latestDay ? e.target.value : null })}
            />
          </label>
        </div>
        <div>
          <div className="font-semibold text-ink">Targets (calendar days)</div>
          <ul className="mt-1">
            {TRANSITIONS.map((t) => (
              <li key={t.key} className="flex justify-between gap-2 py-0.5">
                <span>{t.label}</span>
                <span className="text-ink tabular-nums">
                  {t.target} d{t.assumed ? '*' : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1">* Not in the brief; our assumption.</p>
        </div>
        <div>
          <div className="font-semibold text-ink">Follow-up</div>
          Paid orders only. <b>Overdue</b>: waiting longer than the target for the current step. <b>At risk</b>: at least{' '}
          {Math.round(AT_RISK_SHARE * 100)}% of the target used.
        </div>
        <div>
          <div className="font-semibold text-ink">Finished</div>
          The order’s current kit has a report_ready event. Replaced kits never count.
        </div>
        <div>
          <div className="font-semibold text-ink">Latest timestamps in the files</div>
          <ul className="mt-1">
            {model.quality.latestTimestamps.map((t) => (
              <li key={`${t.at}${t.where}`} className="py-0.5">
                <span className="text-ink tabular-nums">{t.raw}</span> · {t.where}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

export function DataView() {
  return (
    <MainWithRail rail={<RulesCard />}>
      <UploadCard />
      <ChecksCard />
      <OrphansCard />
    </MainWithRail>
  )
}
