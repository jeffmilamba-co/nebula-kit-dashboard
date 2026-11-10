// Core domain types for the kit lifecycle data layer.
// Everything in src/data is framework-free so it can be unit-tested in Node.

export type TzKind = 'utc' | 'offset' | 'naive'

export const MILESTONES = [
  'kit_shipped',
  'kit_delivered',
  'sample_mailed',
  'sample_received',
  'qc_passed',
  'qc_failed',
  'sequencing_complete',
  'report_ready',
] as const
export type Milestone = (typeof MILESTONES)[number]
export type EventType = Milestone | 'kit_replaced'

/** State of one physical kit. */
export type KitState =
  | 'to_customer'
  | 'with_customer'
  | 'to_lab'
  | 'lab_qc'
  | 'sequencing'
  | 'qc_failed'
  | 'reporting'
  | 'complete'
  | 'replaced'
  | 'unknown'

/** Stage of an order (driven by its current kit). */
export type Stage =
  | 'awaiting_shipment'
  | 'to_customer'
  | 'with_customer'
  | 'to_lab'
  | 'lab_qc'
  | 'sequencing'
  | 'reporting'
  | 'awaiting_replacement'
  | 'complete'
  | 'not_shipped'
  | 'no_kit'
  | 'unknown'

export type Owner = 'fulfillment' | 'carrier' | 'customer_care' | 'lab' | 'bioinformatics'

export type TransitionKey =
  | 'order_to_ship'
  | 'ship_to_deliver'
  | 'deliver_to_mail'
  | 'mail_to_receive'
  | 'receive_to_qc'
  | 'qc_to_sequencing'
  | 'sequencing_to_report'
  | 'replace_to_reship'

export type ReplacementReason = 'qc_failed' | 'lost_outbound' | 'lost_return' | 'other'

export type Health = 'on_track' | 'at_risk' | 'overdue' | 'closed'

export interface Order {
  orderId: string
  customerId: string
  /** UTC epoch ms, or null when created_at could not be parsed. */
  createdAt: number | null
  /** UTC calendar day (YYYY-MM-DD) of createdAt. */
  createdDay: string | null
  createdRaw: string
  /** Offset written in created_at (customer-local), in minutes. */
  createdOffsetMin: number | null
  product: string
  country: string
  status: string
  isTest: boolean
}

export interface KitEvent {
  eventId: string
  orderId: string
  kitId: string
  /** Normalized event type; may be a value outside the documented set. */
  type: string
  /** UTC epoch ms. */
  at: number
  /** Timestamp exactly as written in the CSV. */
  raw: string
  tz: TzKind
  source: string
  /** event_ids of duplicate rows (same kit, type and instant) merged into this one. */
  mergedEventIds: string[]
  /** Why this event does not count toward state/durations, if it doesn't. */
  ignored?: 'after_replacement' | 'repeat' | 'unknown_type'
}

export interface Kit {
  /** order_id|kit_id — a kit_id reused on another order is treated as a different kit. */
  key: string
  kitId: string
  orderId: string
  /** Deduplicated events sorted by (time, pipeline rank, event_id). */
  events: KitEvent[]
  firstAt: number
  /** First occurrence of each known event type (events after kit_replaced excluded). */
  firstOf: Partial<Record<EventType, number>>
  /** QC results in time order (for retests). */
  qcEvents: { type: 'qc_passed' | 'qc_failed'; at: number }[]
  replacedAt: number | null
  chainIndex: number
  predecessorKey: string | null
  successorKey: string | null
  replacementReason: ReplacementReason | null
}

export interface OrderRecord {
  order: Order
  /** Kits sorted by first event time. */
  kits: Kit[]
  /** False only for kit-less products (upload_only) that also have no kit events. */
  hasKitPipeline: boolean
}

export interface DatasetOptions {
  products: string[]
  countries: string[]
  statuses: string[]
  minDay: string | null
  maxDay: string | null
}

export interface QualityReport {
  orderRows: number
  eventRows: number
  ordersMissingId: number
  ordersBadDate: number
  duplicateOrderIds: number
  eventsMissingFields: number
  eventsBadTimestamp: number
  badTimestampSamples: string[]
  tzCounts: Record<TzKind, number>
  duplicateEvents: number
  orphanEvents: number
  orphanOrderIds: number
  unknownEventTypes: Record<string, number>
  unknownProducts: Record<string, number>
  unknownStatuses: Record<string, number>
  repeatedMilestones: number
  eventsAfterReplacement: number
  kitsOnMultipleOrders: number
  eventsBeforeOrder: number
  missingScans: Record<string, number>
  kitsWithMissingScan: number
  cancelledWithShipments: number
  refundedCompleted: number
  uploadOnlyWithEvents: number
  replacementReasons: Record<ReplacementReason, number>
  replacedKits: number
  replacedWithoutSuccessor: number
  qcRetests: number
  inconsistentQc: number
  kits: number
  ordersWithKits: number
  kitsPerOrder: Record<number, number>
  testOrders: number
  latestTimestamps: { at: number; raw: string; where: string }[]
}

export interface Model {
  records: OrderRecord[]
  byOrderId: Map<string, OrderRecord>
  byKitId: Map<string, Kit[]>
  byCustomerId: Map<string, OrderRecord[]>
  orphans: KitEvent[]
  /** Latest timestamp anywhere in the data — the default "as of" moment. */
  maxTimestamp: number
  options: DatasetOptions
  quality: QualityReport
  source: { ordersName: string; eventsName: string }
}

export interface Transition {
  key: TransitionKey
  kitKey: string
  start: number
  end: number
  days: number
  withinTarget: boolean
}

export interface OrderSnapshot {
  rec: OrderRecord
  stage: Stage
  currentKit: Kit | null
  /** When the current stage's clock started. */
  clockStart: number | null
  ageDays: number | null
  targetDays: number | null
  /** ageDays / targetDays */
  ratio: number | null
  health: Health | null
  /** Paid order with a running clock: eligible for follow-up. */
  actionable: boolean
  /** report_ready time of the current kit. */
  completedAt: number | null
  transitions: Transition[]
  negativeIntervals: number
  /** For awaiting_replacement: whether a kit_replaced was logged or only a qc_failed. */
  awaitingReason: 'replaced' | 'qc_failed' | null
  multipleActiveKits: boolean
}

export interface FollowUpItem {
  snap: OrderSnapshot
  owner: Owner
  action: string
  overdueDays: number
  ageBand: '45-60' | '60-90' | '90+' | null
}

export interface StageStats {
  key: TransitionKey
  targetDays: number
  n: number
  median: number | null
  p90: number | null
  max: number | null
  withinTargetPct: number | null
  openNow: number
  overdueNow: number
  /** Within target ÷ (completed + currently overdue): counts open, overdue items as misses. */
  slaPct: number | null
}

export interface Filters {
  from: string | null
  to: string | null
  /** null = all */
  products: string[] | null
  countries: string[] | null
  statuses: string[] | null
  includeTest: boolean
}
