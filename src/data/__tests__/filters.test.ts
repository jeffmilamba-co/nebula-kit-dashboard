import { describe, expect, it } from 'vitest'
import { compileFilter, decodeFilters, defaultFilters, encodeFilters, filterKey, isDefault } from '../filters.ts'
import type { DatasetOptions, Order } from '../types.ts'

const options: DatasetOptions = {
  products: ['wgs_30x', 'wgs_100x', 'upload_only'],
  countries: ['US', 'CA', 'GB'],
  statuses: ['paid', 'refunded', 'cancelled'],
  minDay: '2026-05-01',
  maxDay: '2026-10-14',
}

const mkOrder = (o: Partial<Order>): Order => ({
  orderId: 'ord_1',
  customerId: 'cus_1',
  createdAt: Date.UTC(2026, 5, 15),
  createdDay: '2026-06-15',
  createdRaw: '',
  createdOffsetMin: 0,
  product: 'wgs_30x',
  country: 'US',
  status: 'paid',
  isTest: false,
  ...o,
})

describe('filters', () => {
  it('defaults to paid orders, test orders hidden', () => {
    expect(defaultFilters(options)).toEqual({ from: null, to: null, products: null, countries: null, statuses: ['paid'], includeTest: false })
    expect(defaultFilters({ ...options, statuses: ['active', 'closed'] }).statuses).toBeNull()
  })

  it('round-trips through the URL and leaves defaults out', () => {
    expect(encodeFilters(defaultFilters(options), options).toString()).toBe('')
    const f = { from: '2026-06-01', to: '2026-06-30', products: ['wgs_100x'], countries: null, statuses: null, includeTest: true }
    const q = encodeFilters(f, options)
    expect(q.get('status')).toBe('all')
    expect(decodeFilters(q, options)).toEqual(f)
    expect(isDefault(decodeFilters(new URLSearchParams(''), options), options)).toBe(true)
  })

  it('drops values the data does not have and keeps unrelated params', () => {
    const f = decodeFilters(new URLSearchParams('product=wgs_100x,nope&country=ZZ'), options)
    expect(f.products).toEqual(['wgs_100x'])
    expect(f.countries).toBeNull()
    const q = encodeFilters(f, options, new URLSearchParams('q=ord_1'))
    expect(q.get('q')).toBe('ord_1')
  })

  it('compares UTC days inclusively', () => {
    const pred = compileFilter({ ...defaultFilters(options), from: '2026-06-15', to: '2026-06-15' })
    expect(pred(mkOrder({}))).toBe(true)
    expect(pred(mkOrder({ createdDay: '2026-06-16' }))).toBe(false)
    expect(pred(mkOrder({ createdDay: null, createdAt: null }))).toBe(false)
    expect(pred(mkOrder({ isTest: true }))).toBe(false)
    expect(pred(mkOrder({ status: 'refunded' }))).toBe(false)
  })

  it('builds a stable key from filter params only', () => {
    expect(filterKey(new URLSearchParams('q=x&product=a'))).toBe(filterKey(new URLSearchParams('product=a&q=y')))
  })
})
