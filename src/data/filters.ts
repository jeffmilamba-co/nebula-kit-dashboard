import type { DatasetOptions, Filters, Order } from './types.ts'

export const FILTER_PARAMS = ['from', 'to', 'product', 'country', 'status', 'test'] as const

export function defaultFilters(o: DatasetOptions): Filters {
  return {
    from: null,
    to: null,
    products: null,
    countries: null,
    statuses: o.statuses.includes('paid') ? ['paid'] : null,
    includeTest: false,
  }
}

/** null = all; drops values the data doesn't have; "everything selected" and "nothing selected" both mean all. */
export function normalizeList(values: string[] | null, allowed: string[]): string[] | null {
  if (!values) return null
  const set = new Set(values)
  const kept = allowed.filter((v) => set.has(v))
  return kept.length === 0 || kept.length === allowed.length ? null : kept
}

function sameList(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((v) => s.has(v))
}

export function isDefault(f: Filters, o: DatasetOptions): boolean {
  const d = defaultFilters(o)
  return (
    f.from === d.from &&
    f.to === d.to &&
    sameList(f.products, d.products) &&
    sameList(f.countries, d.countries) &&
    sameList(f.statuses, d.statuses) &&
    f.includeTest === d.includeTest
  )
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function decodeFilters(params: URLSearchParams, o: DatasetOptions): Filters {
  const d = defaultFilters(o)
  const list = (key: string, allowed: string[], fallback: string[] | null) => {
    const raw = params.get(key)
    if (raw == null) return fallback
    if (raw === 'all' || raw === '') return null
    return normalizeList(raw.split(','), allowed)
  }
  const day = (key: string) => {
    const v = params.get(key)
    return v && DAY_RE.test(v) ? v : null
  }
  return {
    from: day('from'),
    to: day('to'),
    products: list('product', o.products, d.products),
    countries: list('country', o.countries, d.countries),
    statuses: list('status', o.statuses, d.statuses),
    includeTest: params.get('test') === '1',
  }
}

/** Writes filters into the query, leaving out defaults. Other (non-filter) params are kept. */
export function encodeFilters(f: Filters, o: DatasetOptions, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base)
  for (const k of FILTER_PARAMS) p.delete(k)
  const d = defaultFilters(o)
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  const setList = (key: string, value: string[] | null, allowed: string[], def: string[] | null) => {
    const v = normalizeList(value, allowed)
    if (sameList(v, def)) return
    p.set(key, v === null ? 'all' : v.join(','))
  }
  setList('product', f.products, o.products, d.products)
  setList('country', f.countries, o.countries, d.countries)
  setList('status', f.statuses, o.statuses, d.statuses)
  if (f.includeTest) p.set('test', '1')
  return p
}

/**
 * Just the filter params, as a canonical query string: unrelated params (search, paging) are
 * dropped and the order is fixed, so it works as a memo key and decodes to the same filters.
 */
export function filterKey(params: URLSearchParams): string {
  const p = new URLSearchParams()
  for (const k of FILTER_PARAMS) {
    const v = params.get(k)
    if (v != null) p.set(k, v)
  }
  return p.toString()
}

/** Order date filter compares UTC days, inclusive at both ends. */
export function compileFilter(f: Filters): (o: Order) => boolean {
  const products = f.products ? new Set(f.products) : null
  const countries = f.countries ? new Set(f.countries) : null
  const statuses = f.statuses ? new Set(f.statuses) : null
  return (o) => {
    if (!f.includeTest && o.isTest) return false
    if (products && !products.has(o.product)) return false
    if (countries && !countries.has(o.country)) return false
    if (statuses && !statuses.has(o.status)) return false
    if (f.from && (o.createdDay == null || o.createdDay < f.from)) return false
    if (f.to && (o.createdDay == null || o.createdDay > f.to)) return false
    return true
  }
}
