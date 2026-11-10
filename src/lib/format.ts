import { dayStart } from '../data/time.ts'

const intFmt = new Intl.NumberFormat('en-US')

export const fmtInt = (n: number) => intFmt.format(n)

export const fmtPct = (x: number | null | undefined, digits = 0) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`)

/** Days with one decimal: "4.0 d". */
export const fmtDays = (d: number | null | undefined, digits = 1) => (d == null ? '—' : `${d.toFixed(digits)} d`)

/** Whole days for ages: "62 d". */
export const fmtAge = (d: number | null | undefined) => (d == null ? '—' : `${Math.floor(d)} d`)

const dateTimeUtc = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const dateUtc = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
const shortDateUtc = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })

export const fmtDateTime = (ms: number) => `${dateTimeUtc.format(ms)} UTC`
export const fmtDate = (ms: number) => dateUtc.format(ms)
export const fmtShortDate = (ms: number) => shortDateUtc.format(ms)
export const fmtDay = (day: string) => dateUtc.format(dayStart(day))
export const fmtShortDay = (day: string) => shortDateUtc.format(dayStart(day))

/** A UTC instant shown in a fixed offset, e.g. the customer's local time from created_at. */
export function fmtLocal(ms: number, offsetMin: number): string {
  const sign = offsetMin < 0 ? '−' : '+'
  const abs = Math.abs(offsetMin)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${dateTimeUtc.format(ms + offsetMin * 60_000)} (UTC${sign}${hh}:${mm})`
}

const PRODUCT_LABEL: Record<string, string> = {
  wgs_30x: 'WGS 30x',
  wgs_100x: 'WGS 100x',
  upload_only: 'Upload only',
}
export const productLabel = (p: string) => PRODUCT_LABEL[p] ?? p

export const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : s)
export const statusLabel = titleCase

let regionNames: Intl.DisplayNames | null = null
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
} catch {
  regionNames = null
}

export function countryLabel(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`
