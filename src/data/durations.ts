import { TARGET_DAYS } from './config.ts'
import { elapsedDays } from './time.ts'
import type { Kit, OrderRecord, Transition, TransitionKey } from './types.ts'

/**
 * Completed stage transitions for one order, measured per kit from the first
 * occurrence of each endpoint. A transition is only measured when both
 * endpoints exist on the same kit (we never bridge across a missing scan).
 */
export function transitionsFor(
  rec: OrderRecord,
  kits: Kit[],
  asOf: number,
): { transitions: Transition[]; negative: number } {
  const transitions: Transition[] = []
  let negative = 0
  const add = (key: TransitionKey, kit: Kit, start: number | null | undefined, end: number | null | undefined) => {
    if (start == null || end == null || start > asOf || end > asOf) return
    if (end < start) {
      negative++
      return
    }
    const days = elapsedDays(start, end)
    transitions.push({ key, kitKey: kit.key, start, end, days, withinTarget: days <= TARGET_DAYS[key] })
  }

  // Order → first kit shipped is measured on the order's first kit only.
  if (kits.length) add('order_to_ship', kits[0], rec.order.createdAt, kits[0].firstOf.kit_shipped)

  for (const kit of kits) {
    const f = kit.firstOf
    add('ship_to_deliver', kit, f.kit_shipped, f.kit_delivered)
    add('deliver_to_mail', kit, f.kit_delivered, f.sample_mailed)
    add('mail_to_receive', kit, f.sample_mailed, f.sample_received)
    add('receive_to_qc', kit, f.sample_received, kit.qcEvents[0]?.at)
    add('qc_to_sequencing', kit, f.qc_passed, f.sequencing_complete)
    add('sequencing_to_report', kit, f.sequencing_complete, f.report_ready)
    if (kit.successorKey && kit.replacedAt != null) {
      const successor = kits.find((k) => k.key === kit.successorKey)
      if (successor) add('replace_to_reship', successor, kit.replacedAt, successor.firstOf.kit_shipped)
    }
  }
  return { transitions, negative }
}
