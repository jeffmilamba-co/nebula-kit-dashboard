import { describe, expect, it } from 'vitest'
import { followUpQueue } from '../followup.ts'
import { kpis } from '../metrics.ts'
import { kitStateAt, snapshotOrder } from '../state.ts'
import { at, build, ev, fullKit, iso, order } from './fixtures.ts'

describe('dedupe, orphans and kits', () => {
  it('merges one instant written as Z, offset and naive into a single event', () => {
    const m = build(
      [order('ord_1', 0)],
      [
        ev('ord_1', 'kit_1', 'kit_shipped', '2026-01-02 10:00:00', 'system', 'evt_a'),
        ev('ord_1', 'kit_1', 'kit_shipped', '2026-01-02T05:00:00-05:00', 'system', 'evt_c'),
        ev('ord_1', 'kit_1', 'kit_shipped', '2026-01-02T10:00:00Z', 'system', 'evt_b'),
      ],
    )
    const kit = m.byOrderId.get('ord_1')!.kits[0]
    expect(kit.events).toHaveLength(1)
    // Prefers a row with an explicit zone, then the lowest event_id.
    expect(kit.events[0].eventId).toBe('evt_b')
    expect(kit.events[0].mergedEventIds.sort()).toEqual(['evt_a', 'evt_c'])
    expect(m.quality.duplicateEvents).toBe(2)
  })

  it('keeps the first occurrence when a milestone is scanned again later', () => {
    const m = build(
      [order('ord_1', 0)],
      [ev('ord_1', 'kit_1', 'kit_shipped', iso(1)), ev('ord_1', 'kit_1', 'kit_delivered', iso(6)), ev('ord_1', 'kit_1', 'kit_delivered', iso(4))],
    )
    expect(m.byOrderId.get('ord_1')!.kits[0].firstOf.kit_delivered).toBe(at(4))
    expect(m.quality.repeatedMilestones).toBe(1)
  })

  it('excludes events for orders that do not exist, and lists them', () => {
    const m = build([order('ord_1', 0)], [ev('ord_1', 'kit_1', 'kit_shipped', iso(1)), ev('ord_ghost', 'kit_9', 'qc_passed', iso(3))])
    expect(m.orphans.map((e) => e.orderId)).toEqual(['ord_ghost'])
    expect(m.quality.orphanEvents).toBe(1)
    expect(m.byKitId.has('kit_9')).toBe(false)
  })

  it('builds replacement chains from shuffled rows', () => {
    const m = build(
      [order('ord_1', 0)],
      [
        ev('ord_1', 'kit_2', 'kit_shipped', iso(31)),
        ev('ord_1', 'kit_1', 'kit_replaced', iso(29)),
        ev('ord_1', 'kit_1', 'kit_delivered', iso(5), 'carrier'),
        ev('ord_1', 'kit_1', 'qc_failed', iso(28), 'lab'),
        ev('ord_1', 'kit_1', 'kit_shipped', iso(1)),
        ev('ord_1', 'kit_1', 'sample_received', iso(25), 'lab'),
        ev('ord_1', 'kit_1', 'sample_mailed', iso(15), 'carrier'),
      ],
    )
    const [k1, k2] = m.byOrderId.get('ord_1')!.kits
    expect(k1.kitId).toBe('kit_1')
    expect(k1.events.map((e) => e.type)).toEqual([
      'kit_shipped',
      'kit_delivered',
      'sample_mailed',
      'sample_received',
      'qc_failed',
      'kit_replaced',
    ])
    expect(k1.replacementReason).toBe('qc_failed')
    expect(k1.successorKey).toBe(k2.key)
    expect(k2.predecessorKey).toBe(k1.key)
    expect(k2.chainIndex).toBe(1)
  })

  it('classifies replacement reasons', () => {
    const m = build(
      [order('ord_out', 0), order('ord_ret', 0)],
      [
        ev('ord_out', 'kit_a', 'kit_shipped', iso(1)),
        ev('ord_out', 'kit_a', 'kit_replaced', iso(16)),
        ev('ord_ret', 'kit_b', 'kit_shipped', iso(1)),
        ev('ord_ret', 'kit_b', 'kit_delivered', iso(4)),
        ev('ord_ret', 'kit_b', 'sample_mailed', iso(10)),
        ev('ord_ret', 'kit_b', 'kit_replaced', iso(35)),
      ],
    )
    expect(m.quality.replacementReasons).toMatchObject({ lost_outbound: 1, lost_return: 1 })
    expect(m.quality.replacedWithoutSuccessor).toBe(2)
  })

  it('treats a kit_id reused on two orders as two kits', () => {
    const m = build(
      [order('ord_1', 0), order('ord_2', 0)],
      [ev('ord_1', 'kit_x', 'kit_shipped', iso(1)), ev('ord_2', 'kit_x', 'kit_shipped', iso(2))],
    )
    expect(m.byKitId.get('kit_x')).toHaveLength(2)
    expect(m.quality.kitsOnMultipleOrders).toBe(1)
  })

  it('flags and ignores events logged after a kit was replaced', () => {
    const m = build(
      [order('ord_1', 0)],
      [ev('ord_1', 'kit_1', 'kit_shipped', iso(1)), ev('ord_1', 'kit_1', 'kit_replaced', iso(16)), ev('ord_1', 'kit_1', 'kit_delivered', iso(20))],
    )
    const kit = m.byOrderId.get('ord_1')!.kits[0]
    expect(kit.firstOf.kit_delivered).toBeUndefined()
    expect(kit.events.find((e) => e.type === 'kit_delivered')?.ignored).toBe('after_replacement')
    expect(m.quality.eventsAfterReplacement).toBe(1)
  })

  it('counts skipped scans', () => {
    const m = build(
      [order('ord_1', 0)],
      [ev('ord_1', 'kit_1', 'kit_shipped', iso(1)), ev('ord_1', 'kit_1', 'kit_delivered', iso(4)), ev('ord_1', 'kit_1', 'sample_received', iso(20))],
    )
    expect(m.quality.missingScans).toEqual({ sample_mailed: 1 })
    expect(m.quality.kitsWithMissingScan).toBe(1)
  })
})

describe('kit state and order stage', () => {
  const single = (type: string) => build([order('ord_1', 0)], [ev('ord_1', 'kit_1', type, iso(2))])

  it.each([
    ['kit_shipped', 'to_customer'],
    ['kit_delivered', 'with_customer'],
    ['sample_mailed', 'to_lab'],
    ['sample_received', 'lab_qc'],
    ['qc_passed', 'sequencing'],
    ['sequencing_complete', 'reporting'],
    ['report_ready', 'complete'],
  ])('%s → %s, clock from that milestone', (type, stage) => {
    const s = snapshotOrder(single(type).byOrderId.get('ord_1')!, at(3))
    expect(s.stage).toBe(stage)
    expect(s.clockStart).toBe(at(2))
  })

  it('takes the furthest milestone when a scan is missing, and measures no duration across the gap', () => {
    const m = build(
      [order('ord_1', 0)],
      [ev('ord_1', 'kit_1', 'kit_shipped', iso(1)), ev('ord_1', 'kit_1', 'kit_delivered', iso(4)), ev('ord_1', 'kit_1', 'sample_received', iso(20))],
    )
    const s = snapshotOrder(m.byOrderId.get('ord_1')!, at(21))
    expect(s.stage).toBe('lab_qc')
    expect(s.transitions.map((t) => t.key).sort()).toEqual(['order_to_ship', 'ship_to_deliver'])
  })

  it('a QC failure with no replacement logged waits on a replacement, clock from qc_failed', () => {
    const m = build([order('ord_1', 0)], [ev('ord_1', 'kit_1', 'sample_received', iso(10)), ev('ord_1', 'kit_1', 'qc_failed', iso(12))])
    const s = snapshotOrder(m.byOrderId.get('ord_1')!, at(16))
    expect(s.stage).toBe('awaiting_replacement')
    expect(s.awaitingReason).toBe('qc_failed')
    expect(s.clockStart).toBe(at(12))
    expect(s.health).toBe('overdue')
  })

  it('uses the latest QC result after a retest', () => {
    const m = build(
      [order('ord_1', 0)],
      [ev('ord_1', 'kit_1', 'qc_failed', iso(10)), ev('ord_1', 'kit_1', 'qc_passed', iso(13))],
    )
    const s = snapshotOrder(m.byOrderId.get('ord_1')!, at(14))
    expect(s.stage).toBe('sequencing')
    expect(s.clockStart).toBe(at(13))
    expect(m.quality.qcRetests).toBe(1)
  })

  it('lets sequencing after a failed QC win, but flags it', () => {
    const m = build(
      [order('ord_1', 0)],
      [ev('ord_1', 'kit_1', 'qc_failed', iso(10)), ev('ord_1', 'kit_1', 'sequencing_complete', iso(30))],
    )
    expect(snapshotOrder(m.byOrderId.get('ord_1')!, at(31)).stage).toBe('reporting')
    expect(m.quality.inconsistentQc).toBe(1)
  })

  it('handles orders without kits', () => {
    const m = build(
      [
        order('ord_paid', 0),
        order('ord_cancel', 0, { status: 'cancelled' }),
        order('ord_upload', 0, { product: 'upload_only' }),
      ],
      [],
    )
    const paid = snapshotOrder(m.byOrderId.get('ord_paid')!, at(5))
    expect(paid.stage).toBe('awaiting_shipment')
    expect(paid.clockStart).toBe(at(0))
    expect(paid.health).toBe('overdue')
    expect(snapshotOrder(m.byOrderId.get('ord_cancel')!, at(5)).stage).toBe('not_shipped')
    expect(snapshotOrder(m.byOrderId.get('ord_upload')!, at(5)).stage).toBe('no_kit')
  })

  it('waits on a replacement when every kit was replaced, clock from kit_replaced', () => {
    const m = build([order('ord_1', 0)], [ev('ord_1', 'kit_1', 'kit_shipped', iso(1)), ev('ord_1', 'kit_1', 'kit_replaced', iso(16))])
    const s = snapshotOrder(m.byOrderId.get('ord_1')!, at(17))
    expect(s.stage).toBe('awaiting_replacement')
    expect(s.awaitingReason).toBe('replaced')
    expect(s.clockStart).toBe(at(16))
  })

  it('prefers a kit that was not replaced even if a replaced kit started later', () => {
    const m = build(
      [order('ord_1', 0)],
      [
        ev('ord_1', 'kit_live', 'kit_shipped', iso(1)),
        ev('ord_1', 'kit_live', 'kit_delivered', iso(4)),
        ev('ord_1', 'kit_old', 'kit_shipped', iso(2)),
        ev('ord_1', 'kit_old', 'kit_replaced', iso(3)),
      ],
    )
    const s = snapshotOrder(m.byOrderId.get('ord_1')!, at(10))
    expect(s.currentKit?.kitId).toBe('kit_live')
    expect(s.stage).toBe('with_customer')
  })

  it('ignores events after the as-of moment', () => {
    const m = build([order('ord_1', 0)], fullKit('ord_1', 'kit_1', 0))
    const kit = m.byOrderId.get('ord_1')!.kits[0]
    expect(kitStateAt(kit, at(10)).state).toBe('with_customer')
    expect(kitStateAt(kit, at(100)).state).toBe('complete')
  })

  it('applies overdue and at-risk boundaries (age = target is not overdue)', () => {
    const m = build([order('ord_1', 0)], [ev('ord_1', 'kit_1', 'kit_shipped', iso(0))])
    const rec = m.byOrderId.get('ord_1')!
    expect(snapshotOrder(rec, at(5)).health).toBe('on_track') // 5 of 7 days < 80%
    expect(snapshotOrder(rec, at(6)).health).toBe('at_risk') // ≥ 5.6 days
    expect(snapshotOrder(rec, at(7)).health).toBe('at_risk') // exactly 7: not overdue
    expect(snapshotOrder(rec, at(7) + 60_000).health).toBe('overdue')
  })
})

describe('durations', () => {
  it('measures order → ship on the first kit only, and replacement reshipping separately', () => {
    const m = build(
      [order('ord_1', 0)],
      [
        ev('ord_1', 'kit_1', 'kit_shipped', iso(2)),
        ev('ord_1', 'kit_1', 'kit_replaced', iso(17)),
        ev('ord_1', 'kit_2', 'kit_shipped', iso(19)),
      ],
    )
    const s = snapshotOrder(m.byOrderId.get('ord_1')!, at(20))
    const byKey = Object.fromEntries(s.transitions.map((t) => [t.key, t.days]))
    expect(byKey).toEqual({ order_to_ship: 2, replace_to_reship: 2 })
  })

  it('excludes and counts negative intervals', () => {
    const m = build([order('ord_1', 5)], [ev('ord_1', 'kit_1', 'kit_shipped', iso(2)), ev('ord_1', 'kit_1', 'kit_delivered', iso(4))])
    const s = snapshotOrder(m.byOrderId.get('ord_1')!, at(10))
    expect(s.transitions.map((t) => t.key)).toEqual(['ship_to_deliver'])
    expect(s.negativeIntervals).toBe(1)
  })
})

describe('follow-up queue', () => {
  it('only includes paid orders past target, most overdue (relative to target) first', () => {
    const m = build(
      [
        order('ord_transit', 0),
        order('ord_customer', 0),
        order('ord_refunded', 0, { status: 'refunded' }),
        order('ord_done', 0),
      ],
      [
        ev('ord_transit', 'kit_1', 'kit_shipped', iso(0)), // 20 days in transit vs 7 → ratio 2.9
        ev('ord_customer', 'kit_2', 'kit_shipped', iso(0)),
        ev('ord_customer', 'kit_2', 'kit_delivered', iso(-40)), // odd but fine: 60 days vs 45 → ratio 1.3
        ev('ord_refunded', 'kit_3', 'kit_shipped', iso(0)),
        ...fullKit('ord_done', 'kit_4', -60),
      ],
    )
    const snaps = m.records.map((r) => snapshotOrder(r, at(20)))
    const q = followUpQueue(snaps)
    expect(q.map((i) => i.snap.rec.order.orderId)).toEqual(['ord_transit', 'ord_customer'])
    expect(q[0]).toMatchObject({ owner: 'carrier', overdueDays: 13 })
    expect(q[1]).toMatchObject({ owner: 'customer_care', ageBand: '45-60' })
    const k = kpis(snaps)
    expect(k).toMatchObject({ orders: 4, finished: 1, overdue: 2, inPipeline: 2 })
  })
})
