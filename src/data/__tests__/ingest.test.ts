import { describe, expect, it } from 'vitest'
import { detectKind, missingColumns, parseCsv } from '../csv.ts'
import { normEnum, parseBool } from '../normalize.ts'
import { LoadError, loadDataset } from '../pipeline.ts'
import { snapshotOrder } from '../state.ts'
import { EVENTS_HEADER, ORDERS_HEADER, at, build, ev, iso, order } from './fixtures.ts'

describe('parseCsv', () => {
  it('copes with BOM, CRLF, uppercase headers, extra columns and trailing blank lines', () => {
    const text = '﻿Order_ID,Created_At,Product,Status,Notes\r\nord_1,2026-01-01T00:00:00Z,WGS_30X,Paid,hi\r\n\r\n\r\n'
    const t = parseCsv(text)
    expect(t.headers).toEqual(['order_id', 'created_at', 'product', 'status', 'notes'])
    expect(t.rows).toHaveLength(1)
    expect(t.rows[0].product).toBe('WGS_30X')
  })

  it('handles quoted commas and semicolon-delimited files', () => {
    expect(parseCsv('a,b\n"x, y",2\n').rows[0].a).toBe('x, y')
    const semi = parseCsv('order_id;created_at;product;status\nord_1;2026-01-01;wgs_30x;paid\n')
    expect(semi.headers).toEqual(['order_id', 'created_at', 'product', 'status'])
    expect(semi.rows[0].status).toBe('paid')
  })

  it('detects file kinds and missing columns', () => {
    expect(detectKind(ORDERS_HEADER.split(','))).toBe('orders')
    expect(detectKind(EVENTS_HEADER.split(','))).toBe('events')
    expect(detectKind(['foo', 'bar'])).toBeNull()
    expect(missingColumns('events', ['order_id', 'kit_id', 'event_type'])).toEqual(['occurred_at'])
  })
})

describe('normalization helpers', () => {
  it('normalizes enum-like values', () => {
    expect(normEnum(' Kit Shipped ')).toBe('kit_shipped')
    expect(normEnum('QC-PASSED')).toBe('qc_passed')
    expect(normEnum(undefined)).toBe('')
  })

  it('parses booleans', () => {
    for (const t of ['true', 'TRUE', '1', 'yes', 'Y']) expect(parseBool(t)).toBe(true)
    for (const f of ['false', '0', '', 'no', undefined]) expect(parseBool(f)).toBe(false)
  })
})

describe('loadDataset', () => {
  const orders = [ORDERS_HEADER, order('ord_1', 0)].join('\n')
  const events = [EVENTS_HEADER, ev('ord_1', 'kit_1', 'kit_shipped', iso(1))].join('\n')

  it('works whichever slot each file is dropped into', () => {
    const m = loadDataset({ name: 'b.csv', text: events }, { name: 'a.csv', text: orders })
    expect(m.records).toHaveLength(1)
    expect(m.source).toEqual({ ordersName: 'a.csv', eventsName: 'b.csv' })
  })

  it('rejects two files of the same kind', () => {
    expect(() => loadDataset({ name: 'a.csv', text: orders }, { name: 'b.csv', text: orders })).toThrow(LoadError)
  })

  it('reports missing required columns by name', () => {
    const badEvents = 'event_id,order_id,kit_id,event_type\nevt_1,ord_1,kit_1,kit_shipped\n'
    try {
      loadDataset({ name: 'orders.csv', text: orders }, { name: 'events.csv', text: badEvents })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LoadError)
      expect((e as LoadError).messages.join(' ')).toContain('occurred_at')
    }
  })

  it('rejects files it cannot classify', () => {
    expect(() => loadDataset({ name: 'a.csv', text: 'foo,bar\n1,2\n' }, { name: 'b.csv', text: events })).toThrow(/couldn’t tell/)
  })

  it('normalizes messy values and counts what it had to drop', () => {
    const m = build(
      [
        'ord_1, 2026-01-01T00:00:00Z ,cus_1, WGS_30X ,us, Paid ,TRUE',
        'ord_1,2026-01-02T00:00:00Z,cus_x,wgs_100x,GB,paid,false', // duplicate order_id
        'ord_2,not-a-date,cus_2,wgs_30x,US,paid,false', // bad date: kept with null date
      ],
      [
        ev('ord_1', 'kit_1', 'Kit Shipped', iso(1)),
        ev('ord_1', 'kit_1', 'kit_delivered', '14/01/2026'), // unparseable timestamp: dropped
        ev('ord_1', 'kit_1', 'teleported', iso(2)), // unknown type: kept, ignored for state
      ],
    )
    const o1 = m.byOrderId.get('ord_1')!.order
    expect(o1).toMatchObject({ product: 'wgs_30x', country: 'US', status: 'paid', isTest: true, createdAt: at(0) })
    expect(m.byOrderId.get('ord_2')!.order.createdAt).toBeNull()
    expect(m.quality.duplicateOrderIds).toBe(1)
    expect(m.quality.ordersBadDate).toBe(1)
    expect(m.quality.eventsBadTimestamp).toBe(1)
    expect(m.quality.unknownEventTypes).toEqual({ teleported: 1 })
    expect(snapshotOrder(m.byOrderId.get('ord_1')!, at(10)).stage).toBe('to_customer')
  })
})
