// Kit state machine and order stage, evaluated "as of" a moment in time.
import { AT_RISK_SHARE, STAGES, TARGET_DAYS } from './config.ts'
import { transitionsFor } from './durations.ts'
import { elapsedDays } from './time.ts'
import type { EventType, Health, Kit, KitState, Model, OrderRecord, OrderSnapshot, Stage } from './types.ts'

export interface KitStateResult {
  state: KitState
  /** When the kit entered this state. */
  clockStart: number | null
}

const STATE_RANK: Record<KitState, number> = {
  replaced: -1,
  unknown: 0,
  to_customer: 1,
  with_customer: 2,
  to_lab: 3,
  lab_qc: 4,
  sequencing: 5,
  qc_failed: 5,
  reporting: 6,
  complete: 7,
}

function firstAt(kit: Kit, type: EventType, asOf: number): number | null {
  const v = kit.firstOf[type]
  return v != null && v <= asOf ? v : null
}

/**
 * State of one kit. The highest stage reached wins (not the latest timestamp),
 * so a late carrier scan can never move a kit backwards. For QC, the latest result wins (retests).
 */
export function kitStateAt(kit: Kit, asOf: number): KitStateResult {
  if (kit.replacedAt != null && kit.replacedAt <= asOf) return { state: 'replaced', clockStart: kit.replacedAt }
  const report = firstAt(kit, 'report_ready', asOf)
  if (report != null) return { state: 'complete', clockStart: report }
  const sequenced = firstAt(kit, 'sequencing_complete', asOf)
  if (sequenced != null) return { state: 'reporting', clockStart: sequenced }
  let qc: Kit['qcEvents'][number] | null = null
  for (const q of kit.qcEvents) if (q.at <= asOf) qc = q
  if (qc) return { state: qc.type === 'qc_passed' ? 'sequencing' : 'qc_failed', clockStart: qc.at }
  const received = firstAt(kit, 'sample_received', asOf)
  if (received != null) return { state: 'lab_qc', clockStart: received }
  const mailed = firstAt(kit, 'sample_mailed', asOf)
  if (mailed != null) return { state: 'to_lab', clockStart: mailed }
  const delivered = firstAt(kit, 'kit_delivered', asOf)
  if (delivered != null) return { state: 'with_customer', clockStart: delivered }
  const shipped = firstAt(kit, 'kit_shipped', asOf)
  if (shipped != null) return { state: 'to_customer', clockStart: shipped }
  return { state: 'unknown', clockStart: null }
}

export function snapshotOrder(rec: OrderRecord, asOf: number): OrderSnapshot {
  const order = rec.order
  const kits = rec.kits.filter((k) => k.firstAt <= asOf)
  let stage: Stage = 'unknown'
  let currentKit: Kit | null = null
  let clockStart: number | null = null
  let completedAt: number | null = null
  let awaitingReason: OrderSnapshot['awaitingReason'] = null
  let multipleActiveKits = false

  if (kits.length === 0) {
    if (!rec.hasKitPipeline) stage = 'no_kit'
    else if (order.status === 'paid') {
      stage = 'awaiting_shipment'
      clockStart = order.createdAt
    } else stage = 'not_shipped'
  } else {
    const states = kits.map((k) => ({ kit: k, ...kitStateAt(k, asOf) }))
    const active = states.filter((s) => s.state !== 'replaced')
    if (active.length === 0) {
      // Every kit was replaced and the next one hasn't shipped yet.
      const last = states.reduce((a, b) => ((b.kit.replacedAt ?? 0) > (a.kit.replacedAt ?? 0) ? b : a))
      stage = 'awaiting_replacement'
      awaitingReason = 'replaced'
      clockStart = last.kit.replacedAt
      currentKit = last.kit
    } else {
      multipleActiveKits = active.length > 1
      // Current kit: the latest-started kit that hasn't been replaced (ties → furthest along).
      const cur = active.reduce((a, b) =>
        b.kit.firstAt > a.kit.firstAt || (b.kit.firstAt === a.kit.firstAt && STATE_RANK[b.state] > STATE_RANK[a.state]) ? b : a,
      )
      currentKit = cur.kit
      clockStart = cur.clockStart
      switch (cur.state) {
        case 'qc_failed':
          // QC failed but no kit_replaced was logged: still waiting on a replacement.
          stage = 'awaiting_replacement'
          awaitingReason = 'qc_failed'
          break
        case 'complete':
          stage = 'complete'
          completedAt = cur.clockStart
          break
        case 'to_customer':
        case 'with_customer':
        case 'to_lab':
        case 'lab_qc':
        case 'sequencing':
        case 'reporting':
          stage = cur.state
          break
        default:
          stage = 'unknown'
          clockStart = null
      }
    }
  }

  const transition = STAGES[stage].transition
  const targetDays = transition ? TARGET_DAYS[transition] : null
  let ageDays: number | null = null
  let ratio: number | null = null
  let health: Health | null = null
  if (targetDays != null && clockStart != null) {
    ageDays = Math.max(0, elapsedDays(clockStart, asOf))
    ratio = ageDays / targetDays
    if (order.status !== 'paid') health = 'closed'
    else if (ageDays > targetDays) health = 'overdue'
    else if (ageDays >= AT_RISK_SHARE * targetDays) health = 'at_risk'
    else health = 'on_track'
  }
  const { transitions, negative } = transitionsFor(rec, kits, asOf)
  return {
    rec,
    stage,
    currentKit,
    clockStart,
    ageDays,
    targetDays,
    ratio,
    health,
    actionable: health != null && health !== 'closed',
    completedAt,
    transitions,
    negativeIntervals: negative,
    awaitingReason,
    multipleActiveKits,
  }
}

/** Snapshot every order that existed at `asOf`. */
export function buildSnapshot(model: Model, asOf: number): OrderSnapshot[] {
  const out: OrderSnapshot[] = []
  for (const rec of model.records) {
    if (rec.order.createdAt != null && rec.order.createdAt > asOf) continue
    out.push(snapshotOrder(rec, asOf))
  }
  return out
}
