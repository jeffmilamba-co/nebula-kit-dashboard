// Times each stage of the data pipeline on the bundled sample scaled up N times.
//   npm run bench            → 1x, 10x
//   npm run bench -- 1 5 20  → any scales
// The sample is replicated with suffixed IDs, so duplicates, orphans, replacements and gaps keep
// their proportions. Runs on Node's built-in TypeScript support (no build step).
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { parseCsv } from '../src/data/csv.ts'
import { compileFilter, defaultFilters } from '../src/data/filters.ts'
import { followUpQueue } from '../src/data/followup.ts'
import { kpis, stageDistribution, weeklyVolume } from '../src/data/metrics.ts'
import { buildModel } from '../src/data/model.ts'
import { normalizeEvents, normalizeOrders } from '../src/data/normalize.ts'
import { buildSnapshot } from '../src/data/state.ts'
import { stageStats } from '../src/data/stats.ts'

const read = (name: string) => readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8')

function scale(csv: string, times: number): string {
  const [header, ...rows] = csv.trimEnd().split(/\r?\n/)
  const out = [header]
  for (let k = 0; k < times; k++) {
    for (const row of rows) out.push(k === 0 ? row : row.replace(/\b(ord|cus|kit|evt)_(\w+)/g, `$1_$2x${k}`))
  }
  return out.join('\n')
}

function time<T>(fn: () => T): [T, number] {
  const start = performance.now()
  const result = fn()
  return [result, performance.now() - start]
}

const median = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)]

const scales = process.argv.slice(2).map(Number).filter((n) => n > 0)
const ordersCsv = read('orders.csv')
const eventsCsv = read('kit_events.csv')

for (const times of scales.length ? scales : [1, 10]) {
  const ordersText = scale(ordersCsv, times)
  const eventsText = scale(eventsCsv, times)
  const runs: Record<string, number>[] = []
  let summary = ''
  for (let run = 0; run < 3; run++) {
    const t: Record<string, number> = {}
    const [po, a] = time(() => parseCsv(ordersText))
    const [pe, b] = time(() => parseCsv(eventsText))
    t['parse CSV'] = a + b
    const [o, c] = time(() => normalizeOrders(po.rows))
    const [e, d] = time(() => normalizeEvents(pe.rows))
    t['normalize'] = c + d
    const [model, f] = time(() =>
      buildModel({
        orders: o.orders,
        events: e.events,
        ordersMeta: { rows: po.rows.length, missingId: o.missingId, badDate: o.badDate, duplicateIds: o.duplicateIds },
        eventsMeta: { rows: pe.rows.length, missingFields: e.missingFields, badTimestamp: e.badTimestamp, badTimestampSamples: [], tzCounts: e.tzCounts },
        names: { ordersName: 'orders.csv', eventsName: 'kit_events.csv' },
      }),
    )
    t['build model'] = f
    const [snaps, g] = time(() => buildSnapshot(model, model.maxTimestamp))
    t['snapshot (per as-of)'] = g
    const [, h] = time(() => {
      const pred = compileFilter(defaultFilters(model.options))
      const visible = snaps.filter((s) => pred(s.rec.order))
      followUpQueue(visible, { includeAtRisk: true })
      kpis(visible)
      stageDistribution(visible)
      weeklyVolume(visible)
      stageStats(visible, (s) => s.rec.order.product)
    })
    t['recompute (per filter change)'] = h
    runs.push(t)
    summary = `${model.records.length.toLocaleString('en-US')} orders, ${e.events.length.toLocaleString('en-US')} events`
  }
  console.log(`\n${times}x sample — ${summary} (median of 3 runs)`)
  for (const key of Object.keys(runs[0])) console.log(`  ${key.padEnd(30)} ${median(runs.map((r) => r[key])).toFixed(0).padStart(6)} ms`)
  const load = ['parse CSV', 'normalize', 'build model'].reduce((s, k) => s + median(runs.map((r) => r[k])), 0)
  console.log(`  ${'load total (in the worker)'.padEnd(30)} ${load.toFixed(0).padStart(6)} ms`)
}
