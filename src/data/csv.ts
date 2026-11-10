import Papa from 'papaparse'

export type FileKind = 'orders' | 'events'

export interface CsvTable {
  headers: string[]
  rows: Record<string, string | undefined>[]
  /** Rows whose field count didn't match the header. */
  malformed: number
}

/** Columns the logic needs; everything else is optional or ignored. */
export const REQUIRED_COLUMNS: Record<FileKind, string[]> = {
  orders: ['order_id', 'created_at', 'product', 'status'],
  events: ['order_id', 'kit_id', 'event_type', 'occurred_at'],
}

export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function parseCsv(text: string): CsvTable {
  const res = Papa.parse<Record<string, string | undefined>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    transformHeader: normalizeHeader,
  })
  const headers = (res.meta.fields ?? []).filter((h) => h !== '')
  const malformed = res.errors.filter((e) => e.type === 'FieldMismatch').length
  return { headers, rows: res.data, malformed }
}

/** Decide whether a file is the orders export or the kit events export from its headers. */
export function detectKind(headers: string[]): FileKind | null {
  const h = new Set(headers)
  if (h.has('kit_id') || h.has('event_type') || h.has('occurred_at')) return 'events'
  if (h.has('created_at') || h.has('product') || h.has('customer_id')) return 'orders'
  return null
}

export function missingColumns(kind: FileKind, headers: string[]): string[] {
  const h = new Set(headers)
  return REQUIRED_COLUMNS[kind].filter((c) => !h.has(c))
}
