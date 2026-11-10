import { STAGES } from './config.ts'
import type { FollowUpItem, OrderSnapshot } from './types.ts'

export function ageBand(days: number): '45-60' | '60-90' | '90+' {
  if (days > 90) return '90+'
  if (days > 60) return '60-90'
  return '45-60'
}

export function actionFor(s: OrderSnapshot): string {
  if (s.stage === 'awaiting_replacement' && s.awaitingReason === 'qc_failed') {
    return 'QC failed with no replacement logged: issue and ship a replacement kit'
  }
  if (s.stage === 'with_customer' && s.ageDays != null && s.ageDays > 90) {
    return 'Call the customer; consider closing the order if they can’t be reached'
  }
  return STAGES[s.stage].action
}

/**
 * Orders that need someone to act: paid orders whose current stage has run past its target
 * (optionally also "at risk", ≥80% of target). Most overdue relative to target first.
 */
export function followUpQueue(snaps: OrderSnapshot[], opts: { includeAtRisk?: boolean } = {}): FollowUpItem[] {
  const items: FollowUpItem[] = []
  for (const s of snaps) {
    if (!s.actionable || s.ageDays == null || s.targetDays == null) continue
    if (s.health !== 'overdue' && !(opts.includeAtRisk && s.health === 'at_risk')) continue
    const owner = STAGES[s.stage].owner
    if (!owner) continue
    items.push({
      snap: s,
      owner,
      action: actionFor(s),
      overdueDays: s.ageDays - s.targetDays,
      ageBand: s.stage === 'with_customer' && s.health === 'overdue' ? ageBand(s.ageDays) : null,
    })
  }
  items.sort(
    (a, b) => (b.snap.ratio ?? 0) - (a.snap.ratio ?? 0) || a.snap.rec.order.orderId.localeCompare(b.snap.rec.order.orderId),
  )
  return items
}
