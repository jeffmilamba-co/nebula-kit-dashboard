// One table drives stage labels, targets, owners and follow-up actions.
import type { EventType, Owner, Stage, TransitionKey } from './types.ts'

/** Target turnaround per transition, in calendar days (from the challenge brief). */
export const TARGET_DAYS: Record<TransitionKey, number> = {
  order_to_ship: 3,
  ship_to_deliver: 7,
  deliver_to_mail: 45,
  mail_to_receive: 14,
  receive_to_qc: 7,
  qc_to_sequencing: 28,
  sequencing_to_report: 5,
  // Not in the brief — our assumption, reusing the order → ship target.
  replace_to_reship: 3,
}

export interface TransitionInfo {
  key: TransitionKey
  label: string
  from: string
  to: string
  target: number
  assumed?: boolean
}

export const TRANSITIONS: TransitionInfo[] = [
  { key: 'order_to_ship', label: 'Order placed → kit shipped', from: 'Order placed', to: 'Kit shipped', target: 3 },
  { key: 'ship_to_deliver', label: 'Kit shipped → delivered', from: 'Kit shipped', to: 'Delivered', target: 7 },
  { key: 'deliver_to_mail', label: 'Delivered → sample mailed', from: 'Delivered', to: 'Sample mailed', target: 45 },
  { key: 'mail_to_receive', label: 'Sample mailed → received at lab', from: 'Sample mailed', to: 'Received at lab', target: 14 },
  { key: 'receive_to_qc', label: 'Received → QC result', from: 'Received at lab', to: 'QC result', target: 7 },
  { key: 'qc_to_sequencing', label: 'QC passed → sequencing complete', from: 'QC passed', to: 'Sequencing complete', target: 28 },
  { key: 'sequencing_to_report', label: 'Sequencing complete → report ready', from: 'Sequencing complete', to: 'Report ready', target: 5 },
  { key: 'replace_to_reship', label: 'Kit replaced → replacement shipped', from: 'Kit replaced', to: 'Replacement shipped', target: 3, assumed: true },
]

export interface StageInfo {
  label: string
  /** What the order is waiting for while in this stage. */
  waitingFor: string
  transition: TransitionKey | null
  owner: Owner | null
  action: string
  /** Position in the pipeline (for sorting). */
  order: number
}

export const STAGES: Record<Stage, StageInfo> = {
  awaiting_shipment: { label: 'Awaiting shipment', waitingFor: 'Kit shipped', transition: 'order_to_ship', owner: 'fulfillment', action: 'Ship the kit, or check for a hold on the order', order: 0 },
  to_customer: { label: 'In transit to customer', waitingFor: 'Delivery scan', transition: 'ship_to_deliver', owner: 'carrier', action: 'Open a carrier trace; check for a missing delivery scan', order: 1 },
  with_customer: { label: 'With customer', waitingFor: 'Sample mailed back', transition: 'deliver_to_mail', owner: 'customer_care', action: 'Remind the customer to mail their sample', order: 2 },
  to_lab: { label: 'Return transit', waitingFor: 'Sample received at lab', transition: 'mail_to_receive', owner: 'carrier', action: 'Trace the return shipment', order: 3 },
  lab_qc: { label: 'Lab QC', waitingFor: 'QC result', transition: 'receive_to_qc', owner: 'lab', action: 'Escalate QC with the lab', order: 4 },
  sequencing: { label: 'Sequencing', waitingFor: 'Sequencing complete', transition: 'qc_to_sequencing', owner: 'lab', action: 'Escalate the sequencing run', order: 5 },
  reporting: { label: 'Report generation', waitingFor: 'Report ready', transition: 'sequencing_to_report', owner: 'bioinformatics', action: 'Check the report pipeline', order: 6 },
  awaiting_replacement: { label: 'Awaiting replacement', waitingFor: 'Replacement kit shipped', transition: 'replace_to_reship', owner: 'fulfillment', action: 'Ship the replacement kit', order: 7 },
  complete: { label: 'Report ready', waitingFor: '—', transition: null, owner: null, action: '', order: 8 },
  not_shipped: { label: 'Closed before shipping', waitingFor: '—', transition: null, owner: null, action: '', order: 9 },
  no_kit: { label: 'No kit (upload only)', waitingFor: '—', transition: null, owner: null, action: '', order: 10 },
  unknown: { label: 'Unknown', waitingFor: '—', transition: null, owner: null, action: '', order: 11 },
}

/** Stages that have a running clock and a target, in pipeline order. */
export const ACTIVE_STAGES: Stage[] = [
  'awaiting_shipment',
  'to_customer',
  'with_customer',
  'to_lab',
  'lab_qc',
  'sequencing',
  'reporting',
  'awaiting_replacement',
]

export const OWNERS: { key: Owner; label: string }[] = [
  { key: 'fulfillment', label: 'Fulfillment' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'customer_care', label: 'Customer care' },
  { key: 'lab', label: 'Lab' },
  { key: 'bioinformatics', label: 'Bioinformatics' },
]

export const OWNER_LABEL: Record<Owner, string> = Object.fromEntries(OWNERS.map((o) => [o.key, o.label])) as Record<Owner, string>

/** Pipeline rank of each event type. qc_passed and qc_failed share a rank. */
export const RANK: Record<EventType, number> = {
  kit_shipped: 1,
  kit_delivered: 2,
  sample_mailed: 3,
  sample_received: 4,
  qc_passed: 5,
  qc_failed: 5,
  sequencing_complete: 6,
  report_ready: 7,
  kit_replaced: 8,
}

export const KNOWN_EVENT_TYPES = new Set<string>(Object.keys(RANK))

export const EVENT_LABEL: Record<EventType, string> = {
  kit_shipped: 'Kit shipped',
  kit_delivered: 'Kit delivered',
  sample_mailed: 'Sample mailed',
  sample_received: 'Sample received at lab',
  qc_passed: 'QC passed',
  qc_failed: 'QC failed',
  sequencing_complete: 'Sequencing complete',
  report_ready: 'Report ready',
  kit_replaced: 'Kit replaced',
}

/** Documented values (anything else is kept, but flagged in data quality). */
export const KNOWN_PRODUCTS = ['wgs_30x', 'wgs_100x', 'upload_only']
export const KNOWN_STATUSES = ['paid', 'refunded', 'cancelled']
/** Products where the customer uploads existing data, so no kit is shipped. */
export const NO_KIT_PRODUCTS = new Set(['upload_only'])

/** "At risk" once this share of the target has elapsed. */
export const AT_RISK_SHARE = 0.8
