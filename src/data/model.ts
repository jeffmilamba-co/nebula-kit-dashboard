// Builds the in-memory model: dedupe → orphans → kits → replacement chains → quality report.
import {
  KNOWN_EVENT_TYPES,
  KNOWN_PRODUCTS,
  KNOWN_STATUSES,
  NO_KIT_PRODUCTS,
  RANK,
} from './config.ts'
import { MILESTONES } from './types.ts'
import type {
  DatasetOptions,
  EventType,
  Kit,
  KitEvent,
  Model,
  Order,
  OrderRecord,
  QualityReport,
  ReplacementReason,
  TzKind,
} from './types.ts'

export interface BuildInput {
  orders: Order[]
  events: KitEvent[]
  ordersMeta: { rows: number; missingId: number; badDate: number; duplicateIds: number }
  eventsMeta: {
    rows: number
    missingFields: number
    badTimestamp: number
    badTimestampSamples: string[]
    tzCounts: Record<TzKind, number>
  }
  names: { ordersName: string; eventsName: string }
}

export function rankOf(type: string): number {
  return KNOWN_EVENT_TYPES.has(type) ? RANK[type as EventType] : 50
}

export function compareEvents(a: KitEvent, b: KitEvent): number {
  return a.at - b.at || rankOf(a.type) - rankOf(b.type) || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
}

/** Steps a kit should have passed through before reaching a later milestone. */
const SCAN_STEPS: { name: string; rank: number; present: (f: Kit['firstOf']) => boolean }[] = [
  { name: 'kit_shipped', rank: 1, present: (f) => f.kit_shipped != null },
  { name: 'kit_delivered', rank: 2, present: (f) => f.kit_delivered != null },
  { name: 'sample_mailed', rank: 3, present: (f) => f.sample_mailed != null },
  { name: 'sample_received', rank: 4, present: (f) => f.sample_received != null },
  { name: 'qc_result', rank: 5, present: (f) => f.qc_passed != null || f.qc_failed != null },
  { name: 'sequencing_complete', rank: 6, present: (f) => f.sequencing_complete != null },
]

/** Milestones a kit skipped (a later milestone exists but this scan never arrived). */
export function missingScansOf(kit: Kit): string[] {
  let max = 0
  for (const t of MILESTONES) if (kit.firstOf[t] != null) max = Math.max(max, RANK[t])
  return SCAN_STEPS.filter((s) => s.rank < max && !s.present(kit.firstOf)).map((s) => s.name)
}

function replacementReasonOf(kit: Kit): ReplacementReason {
  let last: string | null = null
  for (const e of kit.events) {
    if (e.ignored || e.type === 'kit_replaced') continue
    if (kit.replacedAt != null && e.at <= kit.replacedAt) last = e.type
  }
  if (last === 'qc_failed') return 'qc_failed'
  if (last === 'kit_shipped') return 'lost_outbound'
  if (last === 'sample_mailed') return 'lost_return'
  return 'other'
}

function rankedValues(values: string[], known: string[]): string[] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const knownPresent = known.filter((k) => counts.has(k))
  const others = [...counts.keys()]
    .filter((k) => !known.includes(k))
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b))
  return [...knownPresent, ...others]
}

function tally(values: string[], known: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of values) if (!known.includes(v)) out[v] = (out[v] ?? 0) + 1
  return out
}

/** Sort order for merging duplicates: rows with the same type and instant end up adjacent, preferred row first. */
function duplicateOrder(a: KitEvent, b: KitEvent): number {
  return (
    a.at - b.at ||
    (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
    Number(a.tz === 'naive') - Number(b.tz === 'naive') ||
    (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
  )
}

/**
 * Merges rows for the same type at the same instant (possibly written in different formats),
 * keeping the row with an explicit timezone over a naive one, then the lowest event_id.
 * Returns new event objects, so the caller's input is never mutated. `mergedEventIds` is only
 * set on events that absorbed a duplicate (~2% of rows), rather than an empty array on every event.
 */
function mergeDuplicates(list: KitEvent[]): KitEvent[] {
  list.sort(duplicateOrder)
  const out: KitEvent[] = []
  let keep: KitEvent | null = null
  for (const e of list) {
    if (keep && keep.type === e.type && keep.at === e.at) {
      ;(keep.mergedEventIds ??= []).push(e.eventId)
      continue
    }
    keep = { eventId: e.eventId, orderId: e.orderId, kitId: e.kitId, type: e.type, at: e.at, raw: e.raw, tz: e.tz, source: e.source }
    out.push(keep)
  }
  return out.sort(compareEvents)
}

/** Lookup indexes over the order records (rebuilt after a model is streamed in from the loader worker). */
export function indexRecords(records: OrderRecord[]): Pick<Model, 'byOrderId' | 'byKitId' | 'byCustomerId'> {
  const byOrderId = new Map<string, OrderRecord>()
  const byKitId = new Map<string, Kit[]>()
  const byCustomerId = new Map<string, OrderRecord[]>()
  for (const r of records) {
    byOrderId.set(r.order.orderId, r)
    for (const k of r.kits) {
      const list = byKitId.get(k.kitId)
      if (list) list.push(k)
      else byKitId.set(k.kitId, [k])
    }
    if (r.order.customerId) {
      const list = byCustomerId.get(r.order.customerId)
      if (list) list.push(r)
      else byCustomerId.set(r.order.customerId, [r])
    }
  }
  return { byOrderId, byKitId, byCustomerId }
}

/** Everything in a Model except the records and the indexes derived from them. */
export type ModelHead = Omit<Model, 'records' | 'byOrderId' | 'byKitId' | 'byCustomerId'>

export function assembleModel(head: ModelHead, records: OrderRecord[]): Model {
  return { ...head, records, ...indexRecords(records) }
}

export function buildModel(input: BuildInput): Model {
  const { orders, events } = input
  const orderById = new Map(orders.map((o) => [o.orderId, o]))

  // 1. Group events by order, then by kit. Nested maps keyed by the raw IDs avoid building and
  //    hashing a composite string key for every one of (possibly hundreds of thousands of) events.
  const eventsByOrder = new Map<string, Map<string, KitEvent[]>>()
  for (const e of events) {
    let kits = eventsByOrder.get(e.orderId)
    if (!kits) eventsByOrder.set(e.orderId, (kits = new Map()))
    const list = kits.get(e.kitId)
    if (list) list.push(e)
    else kits.set(e.kitId, [e])
  }

  // Kit-level quality counters, filled in by buildKit.
  const unknownEventTypes: Record<string, number> = {}
  let repeatedMilestones = 0
  let eventsAfterReplacement = 0
  let qcRetests = 0
  let inconsistentQc = 0

  /** One kit from its deduplicated, time-ordered events. */
  const buildKit = (key: string, list: KitEvent[]): Kit => {
    const replacedAt = list.find((e) => e.type === 'kit_replaced')?.at ?? null
    const firstOf: Kit['firstOf'] = {}
    const qcEvents: Kit['qcEvents'] = []
    for (const e of list) {
      if (!KNOWN_EVENT_TYPES.has(e.type)) {
        e.ignored = 'unknown_type'
        unknownEventTypes[e.type] = (unknownEventTypes[e.type] ?? 0) + 1
        continue
      }
      if (replacedAt != null && e.type !== 'kit_replaced' && e.at > replacedAt) {
        e.ignored = 'after_replacement'
        eventsAfterReplacement++
        continue
      }
      const t = e.type as EventType
      if (t === 'qc_passed' || t === 'qc_failed') qcEvents.push({ type: t, at: e.at })
      if (firstOf[t] != null) {
        e.ignored = 'repeat'
        repeatedMilestones++
        continue
      }
      firstOf[t] = e.at
    }
    if (qcEvents.length > 1) qcRetests++
    const latestQc = qcEvents[qcEvents.length - 1]
    if (latestQc?.type === 'qc_failed' && (firstOf.sequencing_complete != null || firstOf.report_ready != null)) inconsistentQc++
    const first = list[0]
    return {
      key,
      kitId: first.kitId,
      orderId: first.orderId,
      events: list,
      firstAt: first.at,
      firstOf,
      qcEvents,
      replacedAt,
      chainIndex: 0,
      predecessorKey: null,
      successorKey: null,
      replacementReason: null,
    }
  }

  // 2. Per kit: merge duplicates, split off orphans (order_id not in orders), build the kit.
  //    Also track the latest timestamps (the default "as of") and kit IDs reused across orders.
  const latest: QualityReport['latestTimestamps'] = []
  const beatsLatest = (at: number) => latest.length < 3 || at > latest[latest.length - 1].at
  const considerLatest = (at: number, raw: string, where: string) => {
    latest.push({ at, raw, where })
    latest.sort((a, b) => b.at - a.at)
    if (latest.length > 3) latest.pop()
  }
  const orphans: KitEvent[] = []
  const firstOrderOfKitId = new Map<string, string>()
  const sharedKitIds = new Set<string>()
  let duplicateEvents = 0
  const kitsByOrder = new Map<string, Kit[]>()
  for (const [orderId, kitGroups] of eventsByOrder) {
    const isOrphan = !orderById.has(orderId)
    const orderKits: Kit[] = []
    for (const [kitId, rows] of kitGroups) {
      const list = mergeDuplicates(rows)
      duplicateEvents += rows.length - list.length
      for (const e of list) if (beatsLatest(e.at)) considerLatest(e.at, e.raw, `${e.type} · ${e.kitId}`)
      if (isOrphan) {
        orphans.push(...list)
        continue
      }
      const owner = firstOrderOfKitId.get(kitId)
      if (owner === undefined) firstOrderOfKitId.set(kitId, orderId)
      else if (owner !== orderId) sharedKitIds.add(kitId)
      orderKits.push(buildKit(`${orderId}|${kitId}`, list))
    }
    if (orderKits.length) kitsByOrder.set(orderId, orderKits)
  }
  orphans.sort(compareEvents)

  // 4. Order records, replacement chains and per-order quality checks.
  const records: OrderRecord[] = []
  const replacementReasons: Record<ReplacementReason, number> = { qc_failed: 0, lost_outbound: 0, lost_return: 0, other: 0 }
  const kitsPerOrder: Record<number, number> = {}
  const missingScans: Record<string, number> = {}
  let replacedKits = 0
  let replacedWithoutSuccessor = 0
  let uploadOnlyWithEvents = 0
  let cancelledWithShipments = 0
  let refundedCompleted = 0
  let eventsBeforeOrder = 0
  let kitsWithMissingScan = 0
  let kitCount = 0
  for (const order of orders) {
    const kits = (kitsByOrder.get(order.orderId) ?? []).sort(
      (a, b) => a.firstAt - b.firstAt || (a.key < b.key ? -1 : 1),
    )
    const claimed = new Set<string>()
    kits.forEach((kit, i) => {
      kit.chainIndex = i
      if (kit.replacedAt == null) return
      replacedKits++
      kit.replacementReason = replacementReasonOf(kit)
      replacementReasons[kit.replacementReason]++
      const successor = kits.slice(i + 1).find((c) => !claimed.has(c.key))
      if (successor) {
        claimed.add(successor.key)
        kit.successorKey = successor.key
        successor.predecessorKey = kit.key
      } else replacedWithoutSuccessor++
    })
    if (kits.length) kitsPerOrder[kits.length] = (kitsPerOrder[kits.length] ?? 0) + 1
    kitCount += kits.length
    if (NO_KIT_PRODUCTS.has(order.product) && kits.length) uploadOnlyWithEvents++
    if (order.status === 'cancelled') cancelledWithShipments += kits.filter((k) => k.firstOf.kit_shipped != null).length
    if (order.status === 'refunded' && kits.some((k) => k.firstOf.report_ready != null)) refundedCompleted++
    for (const kit of kits) {
      if (order.createdAt != null) {
        for (const e of kit.events) if (!e.ignored && e.at < order.createdAt) eventsBeforeOrder++
      }
      const missing = missingScansOf(kit)
      if (missing.length) {
        kitsWithMissingScan++
        for (const m of missing) missingScans[m] = (missingScans[m] ?? 0) + 1
      }
    }
    records.push({ order, kits, hasKitPipeline: !NO_KIT_PRODUCTS.has(order.product) || kits.length > 0 })
  }

  // 5. Latest timestamps anywhere in the data (the default "as of"); events were considered in step 2.
  for (const o of orders) {
    if (o.createdAt != null && beatsLatest(o.createdAt)) considerLatest(o.createdAt, o.createdRaw, `order created · ${o.orderId}`)
  }
  const maxTimestamp = latest.length ? latest[0].at : Date.now()

  // 6. Filter options derived from the data.
  const days = orders.map((o) => o.createdDay).filter((d): d is string => d != null).sort()
  const options: DatasetOptions = {
    products: rankedValues(orders.map((o) => o.product), KNOWN_PRODUCTS),
    countries: rankedValues(orders.map((o) => o.country), []),
    statuses: rankedValues(orders.map((o) => o.status), KNOWN_STATUSES),
    minDay: days[0] ?? null,
    maxDay: days[days.length - 1] ?? null,
  }

  const quality: QualityReport = {
    orderRows: input.ordersMeta.rows,
    eventRows: input.eventsMeta.rows,
    ordersMissingId: input.ordersMeta.missingId,
    ordersBadDate: input.ordersMeta.badDate,
    duplicateOrderIds: input.ordersMeta.duplicateIds,
    eventsMissingFields: input.eventsMeta.missingFields,
    eventsBadTimestamp: input.eventsMeta.badTimestamp,
    badTimestampSamples: input.eventsMeta.badTimestampSamples,
    tzCounts: input.eventsMeta.tzCounts,
    duplicateEvents,
    orphanEvents: orphans.length,
    orphanOrderIds: new Set(orphans.map((e) => e.orderId)).size,
    unknownEventTypes,
    unknownProducts: tally(orders.map((o) => o.product), KNOWN_PRODUCTS),
    unknownStatuses: tally(orders.map((o) => o.status), KNOWN_STATUSES),
    repeatedMilestones,
    eventsAfterReplacement,
    kitsOnMultipleOrders: sharedKitIds.size,
    eventsBeforeOrder,
    missingScans,
    kitsWithMissingScan,
    cancelledWithShipments,
    refundedCompleted,
    uploadOnlyWithEvents,
    replacementReasons,
    replacedKits,
    replacedWithoutSuccessor,
    qcRetests,
    inconsistentQc,
    kits: kitCount,
    ordersWithKits: records.filter((r) => r.kits.length > 0).length,
    kitsPerOrder,
    testOrders: orders.filter((o) => o.isTest).length,
    latestTimestamps: latest,
  }

  return assembleModel({ orphans, maxTimestamp, options, quality, source: input.names }, records)
}
