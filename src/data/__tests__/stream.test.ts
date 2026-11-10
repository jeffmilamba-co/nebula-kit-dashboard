// The loader worker (src/app/loader.worker.ts) sends the model back as a head plus batches of
// records, each structured-cloned separately; the page rebuilds the indexes. These tests pin down
// that the reassembled model is the same model, and that building one never mutates its input.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assembleModel, buildModel } from '../model.ts'
import type { BuildInput } from '../model.ts'
import { normalizeEvents, normalizeOrders } from '../normalize.ts'
import { parseCsv } from '../csv.ts'
import { loadDataset } from '../pipeline.ts'

const read = (name: string) => readFileSync(new URL(`../../../public/data/${name}`, import.meta.url), 'utf8')

describe('streaming the model from the loader worker', () => {
  const model = loadDataset({ name: 'orders.csv', text: read('orders.csv') }, { name: 'kit_events.csv', text: read('kit_events.csv') })

  it('reassembles the same records and indexes from separately cloned batches', () => {
    const { records, byOrderId, byKitId, byCustomerId, ...head } = model
    const received = []
    for (let i = 0; i < records.length; i += 1000) received.push(...structuredClone(records.slice(i, i + 1000)))
    const back = assembleModel(structuredClone(head), received)

    expect(back.records).toEqual(records)
    expect(back.quality).toEqual(model.quality)
    expect([...back.byOrderId.keys()]).toEqual([...byOrderId.keys()])
    expect([...back.byKitId].map(([k, v]) => [k, v.map((x) => x.key)])).toEqual([...byKitId].map(([k, v]) => [k, v.map((x) => x.key)]))
    expect([...back.byCustomerId].map(([k, v]) => [k, v.length])).toEqual([...byCustomerId].map(([k, v]) => [k, v.length]))

    // The indexes point at the reassembled records themselves, not at copies.
    const rec = back.records.find((r) => r.kits.length > 1)!
    expect(back.byOrderId.get(rec.order.orderId)).toBe(rec)
    expect(back.byKitId.get(rec.kits[1].kitId)).toContain(rec.kits[1])
  })

  it('only marks events that actually absorbed a duplicate', () => {
    const events = model.records.flatMap((r) => r.kits.flatMap((k) => k.events))
    const merged = events.filter((e) => e.mergedEventIds)
    expect(merged.length).toBeGreaterThan(0)
    expect(merged.every((e) => e.mergedEventIds!.length > 0)).toBe(true)
    expect(merged.reduce((n, e) => n + e.mergedEventIds!.length, 0) + model.orphans.reduce((n, e) => n + (e.mergedEventIds?.length ?? 0), 0)).toBe(
      model.quality.duplicateEvents,
    )
  })
})

describe('buildModel', () => {
  it('does not mutate its input, so building twice gives the same model', () => {
    const o = normalizeOrders(parseCsv(read('orders.csv')).rows)
    const e = normalizeEvents(parseCsv(read('kit_events.csv')).rows)
    const input: BuildInput = {
      orders: o.orders,
      events: e.events,
      ordersMeta: { rows: 0, missingId: 0, badDate: 0, duplicateIds: 0 },
      eventsMeta: { rows: 0, missingFields: 0, badTimestamp: 0, badTimestampSamples: [], tzCounts: e.tzCounts },
      names: { ordersName: 'o', eventsName: 'e' },
    }
    const snapshot = structuredClone(input)
    const first = buildModel(input)
    expect(input).toEqual(snapshot)
    expect(buildModel(input).quality).toEqual(first.quality)
  })
})
