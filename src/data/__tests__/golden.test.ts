// Golden values for the bundled sample data. These were computed independently
// (PowerShell profiling + a separate design-review pass) before the app existed.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileFilter, defaultFilters } from '../filters.ts'
import { followUpQueue } from '../followup.ts'
import { kpis, stageDistribution } from '../metrics.ts'
import { loadDataset } from '../pipeline.ts'
import { buildSnapshot } from '../state.ts'
import { stageStats } from '../stats.ts'

const read = (name: string) => readFileSync(new URL(`../../../public/data/${name}`, import.meta.url), 'utf8')

const model = loadDataset({ name: 'orders.csv', text: read('orders.csv') }, { name: 'kit_events.csv', text: read('kit_events.csv') })
const snaps = buildSnapshot(model, model.maxTimestamp)
const pred = compileFilter(defaultFilters(model.options))
const visible = snaps.filter((s) => pred(s.rec.order))

describe('golden: sample data quality', () => {
  const q = model.quality

  it('reads every row and every timestamp format', () => {
    expect(q.orderRows).toBe(5000)
    expect(q.eventRows).toBe(24195)
    expect(q.tzCounts).toEqual({ utc: 20658, offset: 3289, naive: 248 })
    expect(q.eventsBadTimestamp).toBe(0)
  })

  it('merges duplicates and separates orphans', () => {
    expect(q.duplicateEvents).toBe(469)
    expect(q.orphanEvents).toBe(40)
    expect(q.orphanOrderIds).toBe(40)
  })

  it('builds kits and replacement chains', () => {
    expect(q.kits).toBe(4336)
    expect(q.kitsPerOrder).toEqual({ 1: 3931, 2: 195, 3: 5 })
    expect(q.replacedKits).toBe(209)
    expect(q.replacedWithoutSuccessor).toBe(4)
    expect(q.replacementReasons).toEqual({ qc_failed: 140, lost_outbound: 36, lost_return: 32, other: 1 })
    expect(q.eventsAfterReplacement).toBe(0)
  })

  it('finds the skipped carrier scans', () => {
    expect(q.missingScans).toEqual({ kit_delivered: 28, sample_mailed: 55 })
    expect(q.kitsWithMissingScan).toBe(82)
    expect(q.testOrders).toBe(67)
  })
})

describe('golden: default view (paid, no test orders)', () => {
  it('matches the stage snapshot', () => {
    const k = kpis(visible)
    expect(k.kitOrders).toBe(3902)
    expect(k.finished).toBe(2496)
    expect(k.overdue).toBe(321)
    const dist = Object.fromEntries(stageDistribution(visible).map((r) => [r.stage, [r.total, r.overdue]]))
    expect(dist).toEqual({
      awaiting_shipment: [3, 3],
      to_customer: [40, 7],
      with_customer: [677, 278],
      to_lab: [137, 4],
      lab_qc: [78, 2],
      sequencing: [417, 22],
      reporting: [50, 5],
      awaiting_replacement: [4, 0],
    })
    expect(followUpQueue(visible)).toHaveLength(321)
  })

  it('uses the latest timestamp in the data as "now"', () => {
    expect(new Date(model.maxTimestamp).toISOString()).toBe('2026-10-19T23:46:00.000Z')
  })

  it('counts in-flight and at-risk orders', () => {
    const k = kpis(visible)
    expect(k.inPipeline).toBe(1406)
    expect(k.atRisk).toBe(50)
  })

  it('exposes the censoring trap: delivered → mailed looks 97% on time, SLA is ~90%', () => {
    const d2m = stageStats(visible).get('all')!.find((s) => s.key === 'deliver_to_mail')!
    expect(d2m).toMatchObject({ n: 3267, openNow: 677, overdueNow: 278 })
    expect(d2m.withinTargetPct).toBeCloseTo(0.9728, 4)
    expect(d2m.slaPct).toBeCloseTo(0.8965, 4)
  })

  it('flags closed orders that still moved through the pipeline', () => {
    // 34 kit_shipped rows on cancelled orders, one of them a duplicate.
    expect(model.quality.cancelledWithShipments).toBe(33)
    expect(model.quality.refundedCompleted).toBe(22)
  })
})
