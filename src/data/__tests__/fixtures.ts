import { loadDataset } from '../pipeline.ts'
import { DAY_MS } from '../time.ts'
import type { Model } from '../types.ts'

export const ORDERS_HEADER = 'order_id,created_at,customer_id,product,country,status,is_test'
export const EVENTS_HEADER = 'event_id,order_id,kit_id,event_type,occurred_at,source'

/** Day 0 of the fixtures: 2026-01-01T00:00:00Z. */
export const BASE = Date.UTC(2026, 0, 1)

/** UTC instant `n` days (plus `hours`) after BASE, as epoch ms. */
export const at = (n: number, hours = 0) => BASE + n * DAY_MS + hours * 3_600_000

/** Same instant as an ISO string with Z. */
export const iso = (n: number, hours = 0) => new Date(at(n, hours)).toISOString().replace('.000Z', 'Z')

export function order(
  id: string,
  createdDay: number,
  opts: Partial<{ product: string; country: string; status: string; test: boolean; customer: string; created: string }> = {},
): string {
  return [
    id,
    opts.created ?? iso(createdDay),
    opts.customer ?? `cus_${id}`,
    opts.product ?? 'wgs_30x',
    opts.country ?? 'US',
    opts.status ?? 'paid',
    opts.test ? 'true' : 'false',
  ].join(',')
}

let seq = 0
export function ev(orderId: string, kitId: string, type: string, when: string, source = 'system', id?: string): string {
  return [id ?? `evt_${String(++seq).padStart(5, '0')}`, orderId, kitId, type, when, source].join(',')
}

export function build(orders: string[], events: string[]): Model {
  return loadDataset(
    { name: 'orders.csv', text: [ORDERS_HEADER, ...orders].join('\n') },
    { name: 'kit_events.csv', text: [EVENTS_HEADER, ...events].join('\n') },
  )
}

/** Full happy path for one kit, starting `start` days after BASE. */
export function fullKit(orderId: string, kitId: string, start: number): string[] {
  return [
    ev(orderId, kitId, 'kit_shipped', iso(start + 1)),
    ev(orderId, kitId, 'kit_delivered', iso(start + 5), 'carrier'),
    ev(orderId, kitId, 'sample_mailed', iso(start + 15), 'carrier'),
    ev(orderId, kitId, 'sample_received', iso(start + 20), 'lab'),
    ev(orderId, kitId, 'qc_passed', iso(start + 23), 'lab'),
    ev(orderId, kitId, 'sequencing_complete', iso(start + 41), 'lab'),
    ev(orderId, kitId, 'report_ready', iso(start + 43)),
  ]
}
