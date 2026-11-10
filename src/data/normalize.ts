import type { KitEvent, Order, TzKind } from './types.ts'
import { parseTimestamp, utcDay } from './time.ts'

type Row = Record<string, string | undefined>

/** Enum-like values: trim, lowercase, spaces/hyphens → underscore ("Kit Shipped" → "kit_shipped"). */
export function normEnum(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function parseBool(s: string | undefined): boolean {
  const v = (s ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'y' || v === 't'
}

export interface OrdersResult {
  orders: Order[]
  missingId: number
  badDate: number
  duplicateIds: number
}

export function normalizeOrders(rows: Row[]): OrdersResult {
  const orders: Order[] = []
  const seen = new Set<string>()
  let missingId = 0
  let badDate = 0
  let duplicateIds = 0
  for (const row of rows) {
    const orderId = (row.order_id ?? '').trim()
    if (!orderId) {
      missingId++
      continue
    }
    if (seen.has(orderId)) {
      duplicateIds++
      continue
    }
    seen.add(orderId)
    const ts = parseTimestamp(row.created_at)
    if (!ts) badDate++
    orders.push({
      orderId,
      customerId: (row.customer_id ?? '').trim(),
      createdAt: ts?.ms ?? null,
      createdDay: ts ? utcDay(ts.ms) : null,
      createdRaw: (row.created_at ?? '').trim(),
      createdOffsetMin: ts?.offsetMin ?? null,
      product: normEnum(row.product) || 'unknown',
      country: (row.country ?? '').trim().toUpperCase() || 'Unknown',
      status: normEnum(row.status) || 'unknown',
      isTest: parseBool(row.is_test),
    })
  }
  return { orders, missingId, badDate, duplicateIds }
}

export interface EventsResult {
  events: KitEvent[]
  missingFields: number
  badTimestamp: number
  badTimestampSamples: string[]
  tzCounts: Record<TzKind, number>
}

export function normalizeEvents(rows: Row[]): EventsResult {
  const events: KitEvent[] = []
  const tzCounts: Record<TzKind, number> = { utc: 0, offset: 0, naive: 0 }
  const badTimestampSamples: string[] = []
  let missingFields = 0
  let badTimestamp = 0
  rows.forEach((row, i) => {
    const orderId = (row.order_id ?? '').trim()
    const kitId = (row.kit_id ?? '').trim()
    const type = normEnum(row.event_type)
    if (!orderId || !kitId || !type) {
      missingFields++
      return
    }
    const raw = (row.occurred_at ?? '').trim()
    const ts = parseTimestamp(raw)
    if (!ts) {
      badTimestamp++
      if (badTimestampSamples.length < 5) badTimestampSamples.push(raw || '(empty)')
      return
    }
    tzCounts[ts.tz]++
    events.push({
      // Row number in the file (header = line 1) when event_id is missing.
      eventId: (row.event_id ?? '').trim() || `row-${i + 2}`,
      orderId,
      kitId,
      type,
      at: ts.ms,
      raw,
      tz: ts.tz,
      source: normEnum(row.source),
    })
  })
  return { events, missingFields, badTimestamp, badTimestampSamples, tzCounts }
}
