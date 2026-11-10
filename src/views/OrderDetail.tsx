import { ArrowLeft, CircleCheck, Info, Link2, Package, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useDerived } from '../app/derived.tsx'
import { EVENT_LABEL, KNOWN_EVENT_TYPES, OWNER_LABEL, STAGES, TARGET_DAYS, TRANSITIONS } from '../data/config.ts'
import { actionFor } from '../data/followup.ts'
import { missingScansOf, rankOf } from '../data/model.ts'
import { kitStateAt } from '../data/state.ts'
import type { EventType, Kit, KitEvent, OrderSnapshot, Transition, TransitionKey } from '../data/types.ts'
import { HEALTH_COLOR } from '../lib/colors.ts'
import { countryLabel, fmtAge, fmtDate, fmtDateTime, fmtDays, fmtLocal, productLabel, statusLabel, titleCase } from '../lib/format.ts'
import { Badge, HealthBadge, HealthIcon } from '../ui/Badge.tsx'
import { Button } from '../ui/Button.tsx'
import { StageIcon } from '../ui/StageIcon.tsx'

const END_TYPE: Record<TransitionKey, string> = {
  order_to_ship: 'kit_shipped',
  ship_to_deliver: 'kit_delivered',
  deliver_to_mail: 'sample_mailed',
  mail_to_receive: 'sample_received',
  receive_to_qc: 'qc',
  qc_to_sequencing: 'sequencing_complete',
  sequencing_to_report: 'report_ready',
  replace_to_reship: 'kit_shipped',
}

const MISSING: Record<string, { label: string; rank: number }> = {
  kit_shipped: { label: 'Kit shipped', rank: 1 },
  kit_delivered: { label: 'Kit delivered', rank: 2 },
  sample_mailed: { label: 'Sample mailed', rank: 3 },
  sample_received: { label: 'Sample received at lab', rank: 4 },
  qc_result: { label: 'QC result', rank: 5 },
  sequencing_complete: { label: 'Sequencing complete', rank: 6 },
}

const IGNORED_LABEL: Record<NonNullable<KitEvent['ignored']>, string> = {
  after_replacement: 'logged after this kit was replaced: ignored',
  repeat: 'repeat scan: the first one counts',
  unknown_type: 'unknown event type: ignored for status',
}

const REASON_LABEL = {
  qc_failed: 'QC failed',
  lost_outbound: 'lost on the way to the customer',
  lost_return: 'lost on the way back to the lab',
  other: 'replaced',
} as const

type Row = { kind: 'event'; e: KitEvent; t?: Transition } | { kind: 'missing'; label: string } | { kind: 'pending' }

function buildRows(kit: Kit, snap: OrderSnapshot): Row[] {
  const tFor = (e: KitEvent) =>
    snap.transitions.find(
      (t) => t.kitKey === kit.key && t.end === e.at && (END_TYPE[t.key] === e.type || (END_TYPE[t.key] === 'qc' && e.type.startsWith('qc_'))),
    )
  const missing = missingScansOf(kit).map((name) => MISSING[name])
  const rows: Row[] = []
  let mi = 0
  for (const e of kit.events) {
    if (!e.ignored) {
      const r = rankOf(e.type)
      while (mi < missing.length && missing[mi].rank < r) rows.push({ kind: 'missing', label: missing[mi++].label })
    }
    rows.push({ kind: 'event', e, t: e.ignored ? undefined : tFor(e) })
  }
  while (mi < missing.length) rows.push({ kind: 'missing', label: missing[mi++].label })
  if (snap.currentKit?.key === kit.key && snap.targetDays != null && snap.clockStart != null && snap.stage !== 'complete') {
    rows.push({ kind: 'pending' })
  }
  return rows
}

function TimelineItem({ dot, children }: { dot: ReactNode; children: ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-3 pl-6 before:absolute before:top-4 before:bottom-0 before:left-[5px] before:w-px before:bg-line-strong last:pb-0 last:before:hidden">
      <span className="absolute top-1 left-0">{dot}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}

const solidDot = (color: string) => <span className="block size-[11px] rounded-full" style={{ backgroundColor: color }} />

function TookLine({ t }: { t: Transition }) {
  const info = TRANSITIONS.find((x) => x.key === t.key)!
  const target = TARGET_DAYS[t.key]
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-ink-2">
      {fmtDays(t.days)} after {info.from.toLowerCase()} ·
      {t.withinTarget ? (
        <span className="inline-flex items-center gap-0.5 text-success">
          <CircleCheck size={12} aria-hidden /> within {target} d
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5 font-semibold text-danger">
          <TriangleAlert size={12} aria-hidden /> {fmtDays(t.days - target)} over the {target} d target
        </span>
      )}
    </span>
  )
}

function KitItem({ kit, snap, asOf }: { kit: Kit; snap: OrderSnapshot; asOf: number }) {
  const rows = buildRows(kit, snap)
  const state = kitStateAt(kit, asOf).state
  const isCurrent = snap.currentKit?.key === kit.key && state !== 'replaced'
  const kitIdOf = (key: string | null) => (key ? key.slice(key.indexOf('|') + 1) : null)
  const pred = kitIdOf(kit.predecessorKey)
  const succ = kitIdOf(kit.successorKey)
  const counted = kit.events.filter((e) => !e.ignored)
  const last = counted.length ? counted[counted.length - 1].at : kit.firstAt
  const open = isCurrent && state !== 'complete'
  const end = open ? asOf : last

  return (
    <li className="flex gap-3 border-b border-line py-4 last:border-b-0">
      <span className="flex size-12 shrink-0 items-center justify-center rounded bg-[#eef3f8] text-brand" aria-hidden>
        <Package size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">Kit {kit.kitId}</h3>
          {isCurrent && <Badge tone="brand">Current kit</Badge>}
          {kit.replacedAt != null && <Badge>Replaced</Badge>}
        </div>
        <p className="text-sm">
          {kit.chainIndex === 0 ? 'Original kit' : `Replacement ${kit.chainIndex}`}
          {pred && ` · replaces ${pred}`}
          {kit.replacementReason && ` · ${REASON_LABEL[kit.replacementReason]}`}
          {succ && ` · replaced by ${succ}`}
        </p>
        <p className="text-xs text-ink-2">
          {fmtDate(kit.firstAt)} – {open ? 'now' : fmtDate(last)} · {fmtDays(Math.max(0, (end - kit.firstAt) / 86_400_000))}
        </p>
        <ol className="mt-3">
          {rows.map((r, i) => {
            if (r.kind === 'missing') {
              return (
                <TimelineItem key={`m${i}`} dot={<span className="block size-[11px] rounded-full border-2 border-dashed border-ink-3 bg-surface" />}>
                  <div className="text-sm text-ink-2">{r.label}</div>
                  <div className="text-xs text-ink-3 italic">No scan recorded. The kit clearly passed this step, so it isn’t timed.</div>
                </TimelineItem>
              )
            }
            if (r.kind === 'pending') {
              const health = snap.health ?? 'on_track'
              return (
                <TimelineItem
                  key="pending"
                  dot={<span className="block size-[11px] rounded-full border-2 bg-surface" style={{ borderColor: HEALTH_COLOR[health] }} />}
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    Waiting for: {STAGES[snap.stage].waitingFor.toLowerCase()}
                    <HealthBadge health={snap.health} />
                  </div>
                  <div className="text-xs text-ink-2">
                    {fmtAge(snap.ageDays)} so far · target {snap.targetDays} d
                  </div>
                </TimelineItem>
              )
            }
            const e = r.e
            const known = KNOWN_EVENT_TYPES.has(e.type)
            const label = known ? EVENT_LABEL[e.type as EventType] : titleCase(e.type)
            const color = e.ignored
              ? '#c3c2b7'
              : e.type === 'qc_failed' || e.type === 'kit_replaced'
                ? '#cc1016'
                : e.type === 'report_ready'
                  ? '#057642'
                  : '#0a66c2'
            const notes = [
              e.tz === 'naive' ? 'no timezone in the file: read as UTC' : null,
              e.mergedEventIds.length ? `merged duplicate${e.mergedEventIds.length > 1 ? 's' : ''} ${e.mergedEventIds.join(', ')}` : null,
              e.ignored ? IGNORED_LABEL[e.ignored] : null,
            ].filter(Boolean)
            return (
              <TimelineItem key={e.eventId} dot={solidDot(color)}>
                <div className={`flex flex-wrap items-baseline justify-between gap-x-3 text-sm ${e.ignored ? 'text-ink-3' : ''}`}>
                  <span className="font-semibold">{label}</span>
                  <span className="text-xs text-ink-2 tabular-nums" title={`As written: ${e.raw}`}>
                    {fmtDateTime(e.at)}
                    {e.source && ` · ${e.source}`}
                  </span>
                </div>
                {e.type === 'kit_replaced' && kit.replacementReason && (
                  <div className="text-xs text-ink-2">
                    Reason: {REASON_LABEL[kit.replacementReason]}
                    {succ ? ` → new kit ${succ}` : ' → replacement not shipped yet'}
                  </div>
                )}
                {r.t && <TookLine t={r.t} />}
                {notes.length > 0 && <div className="text-xs text-ink-3">{notes.join(' · ')}</div>}
              </TimelineItem>
            )
          })}
        </ol>
      </div>
    </li>
  )
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="tertiary"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      <Link2 size={16} aria-hidden /> {copied ? 'Copied' : 'Copy link'}
    </Button>
  )
}

const productShort = (p: string) => (p === 'wgs_30x' ? '30x' : p === 'wgs_100x' ? '100x' : p === 'upload_only' ? 'UP' : p.slice(0, 4).toUpperCase())

export function OrderDetail({ snap, inFilter, backHref }: { snap: OrderSnapshot; inFilter: boolean; backHref: string }) {
  const { asOf } = useDerived()
  const o = snap.rec.order
  const kits = [...snap.rec.kits].reverse()
  const owner = STAGES[snap.stage].owner
  const events = snap.rec.kits.flatMap((k) => k.events)
  const merged = events.reduce((n, e) => n + e.mergedEventIds.length, 0)
  const showCallout = snap.actionable && (snap.health === 'overdue' || snap.health === 'at_risk')

  return (
    <article className="flex flex-col">
      <a href={backHref} className="flex items-center gap-1 px-4 pt-3 text-sm font-semibold text-ink-2 hover:text-ink md:hidden">
        <ArrowLeft size={16} aria-hidden /> Back to orders
      </a>
      <div className="h-20 bg-[linear-gradient(120deg,#0a66c2_0%,#5b9bd5_55%,#a7c7e7_100%)] md:rounded-tr-lg" aria-hidden />
      <div className="px-6 pb-4">
        <div className="-mt-10 flex size-20 items-center justify-center rounded-full border-4 border-surface bg-[#eef3f8] text-lg font-bold text-brand shadow-card">
          {productShort(o.product)}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold break-all">{o.orderId}</h1>
          <CopyLinkButton />
        </div>
        <p className="text-base">
          {productLabel(o.product)} · {countryLabel(o.country)} · {statusLabel(o.status)}
        </p>
        <p className="mt-0.5 text-sm text-ink-2">
          Customer {o.customerId || '—'} · Ordered{' '}
          {o.createdAt != null ? (
            <>
              {fmtLocal(o.createdAt, o.createdOffsetMin ?? 0)} <span className="text-ink-3">({fmtDateTime(o.createdAt)})</span>
            </>
          ) : (
            <>on an unreadable date (“{o.createdRaw}”)</>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="brand">
            <StageIcon stage={snap.stage} size={12} /> {STAGES[snap.stage].label}
          </Badge>
          <HealthBadge health={snap.health} />
          {o.isTest && <Badge>Test order</Badge>}
          {snap.rec.kits.length > 1 && <Badge>{snap.rec.kits.length} kits</Badge>}
        </div>
      </div>

      {!inFilter && (
        <div className="mx-6 mb-4 flex gap-2 rounded-lg bg-[#eef3f8] px-4 py-3 text-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          This order is outside your current filters. It’s shown because you opened it directly.
        </div>
      )}

      {showCallout && owner && (
        <div className={`mx-6 mb-4 rounded-lg px-4 py-3 ${snap.health === 'overdue' ? 'bg-danger-soft' : 'bg-warning-soft'}`}>
          <div className={`flex items-center gap-2 font-semibold ${snap.health === 'overdue' ? 'text-danger' : 'text-warning'}`}>
            <HealthIcon health={snap.health!} /> {snap.health === 'overdue' ? 'Needs follow-up' : 'At risk'}
          </div>
          <p className="mt-1 text-sm">
            {STAGES[snap.stage].label} for {fmtAge(snap.ageDays)}:{' '}
            {snap.health === 'overdue'
              ? `${fmtAge((snap.ageDays ?? 0) - (snap.targetDays ?? 0))} past`
              : 'getting close to'}{' '}
            the {snap.targetDays}-day target.
          </p>
          <p className="text-sm">
            <b>{OWNER_LABEL[owner]}:</b> {actionFor(snap)}.
          </p>
        </div>
      )}
      {!snap.actionable && snap.health === 'closed' && (
        <div className="mx-6 mb-4 flex gap-2 rounded-lg bg-[#f3f2ef] px-4 py-3 text-sm text-ink-2">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          This order is {statusLabel(o.status).toLowerCase()}, so it never appears in follow-up even though its kit is still in{' '}
          {STAGES[snap.stage].label.toLowerCase()}.
        </div>
      )}

      <section className="border-t border-line px-6 py-4" aria-label="Kit journey">
        <h2 className="text-lg font-semibold">Kit journey</h2>
        <p className="text-xs text-ink-2">Newest kit first. Times in UTC; hover a time to see it as written in the file.</p>
        {kits.length === 0 ? (
          <div className="mt-3 text-sm text-ink-2">
            {snap.stage === 'no_kit' ? (
              'Upload-only order: the customer uploads existing data, so no kit is shipped.'
            ) : snap.stage === 'awaiting_shipment' ? (
              <ol className="mt-2">
                <TimelineItem
                  dot={<span className="block size-[11px] rounded-full border-2 bg-surface" style={{ borderColor: HEALTH_COLOR[snap.health ?? 'on_track'] }} />}
                >
                  <div className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    Waiting for the kit to ship <HealthBadge health={snap.health} />
                  </div>
                  <div className="text-xs">
                    {fmtAge(snap.ageDays)} since the order · target {snap.targetDays} d
                  </div>
                </TimelineItem>
              </ol>
            ) : (
              'No kit events for this order.'
            )}
          </div>
        ) : (
          <ol>
            {kits.map((k) => (
              <KitItem key={k.key} kit={k} snap={snap} asOf={asOf} />
            ))}
          </ol>
        )}
      </section>

      {events.length > 0 && (
        <details className="border-t border-line px-6 py-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-2 hover:text-ink">
            Raw events ({events.length} kept{merged ? `, ${merged} duplicate${merged > 1 ? 's' : ''} merged` : ''})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="text-left text-ink-2">
                <tr>
                  <th className="py-1.5 pr-2 font-semibold">event_id</th>
                  <th className="py-1.5 pr-2 font-semibold">kit_id</th>
                  <th className="py-1.5 pr-2 font-semibold">event_type</th>
                  <th className="py-1.5 pr-2 font-semibold">occurred_at (as written)</th>
                  <th className="py-1.5 pr-2 font-semibold">source</th>
                  <th className="py-1.5 font-semibold">notes</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {[...events]
                  .sort((a, b) => a.at - b.at)
                  .map((e) => (
                    <tr key={e.eventId} className="border-t border-line">
                      <td className="py-1.5 pr-2">{e.eventId}</td>
                      <td className="py-1.5 pr-2">{e.kitId}</td>
                      <td className="py-1.5 pr-2">{e.type}</td>
                      <td className="py-1.5 pr-2">{e.raw}</td>
                      <td className="py-1.5 pr-2">{e.source}</td>
                      <td className="py-1.5 font-sans text-ink-2">
                        {[
                          e.tz === 'naive' ? 'naive → UTC' : null,
                          e.mergedEventIds.length ? `+ ${e.mergedEventIds.join(', ')}` : null,
                          e.ignored ?? null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </article>
  )
}
