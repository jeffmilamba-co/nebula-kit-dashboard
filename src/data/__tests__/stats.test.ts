import { describe, expect, it } from 'vitest'
import { snapshotOrder } from '../state.ts'
import { quantile, sortAsc, stageStats } from '../stats.ts'
import { at, build, ev, iso, order } from './fixtures.ts'

describe('quantile (R-7)', () => {
  it('interpolates between ranks', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0.9)).toBeCloseTo(3.7)
    expect(quantile([5], 0.9)).toBe(5)
    expect(quantile([], 0.5)).toBeNull()
  })

  it('sorts numerically into a typed array without touching the input', () => {
    const input = [10, 9, 1.5, 100, -2]
    expect([...sortAsc(input)]).toEqual([-2, 1.5, 9, 10, 100])
    expect(input).toEqual([10, 9, 1.5, 100, -2])
  })
})

describe('stageStats', () => {
  it('counts open, overdue items as misses in the SLA %', () => {
    // Three delivered → mailed transitions completed (one late), plus two customers still holding kits (one overdue).
    const m = build(
      ['a', 'b', 'c', 'd', 'e'].map((id) => order(id, 0)),
      [
        ...['a', 'b', 'c', 'd', 'e'].map((id) => ev(id, `kit_${id}`, 'kit_delivered', iso(0))),
        ev('a', 'kit_a', 'sample_mailed', iso(10)),
        ev('b', 'kit_b', 'sample_mailed', iso(20)),
        ev('c', 'kit_c', 'sample_mailed', iso(50)),
        ev('e', 'kit_e', 'kit_delivered', iso(40)), // repeat scan, ignored: first delivery at day 0 counts
      ],
    )
    const snaps = m.records.map((r) => snapshotOrder(r, at(60)))
    const s = stageStats(snaps).get('all')!.find((x) => x.key === 'deliver_to_mail')!
    expect(s).toMatchObject({ n: 3, median: 20, openNow: 2, overdueNow: 2 })
    expect(s.withinTargetPct).toBeCloseTo(2 / 3)
    expect(s.slaPct).toBeCloseTo(2 / 5)
  })

  it('groups by any key', () => {
    const m = build(
      [order('a', 0, { product: 'wgs_30x' }), order('b', 0, { product: 'wgs_100x' })],
      [ev('a', 'k1', 'kit_shipped', iso(1)), ev('b', 'k2', 'kit_shipped', iso(2))],
    )
    const snaps = m.records.map((r) => snapshotOrder(r, at(3)))
    const g = stageStats(snaps, (s) => s.rec.order.product)
    expect(g.get('wgs_30x')!.find((x) => x.key === 'order_to_ship')!.median).toBe(1)
    expect(g.get('wgs_100x')!.find((x) => x.key === 'order_to_ship')!.median).toBe(2)
  })
})
