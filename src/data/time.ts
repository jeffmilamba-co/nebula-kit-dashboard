// Timezone-safe timestamp handling.
// Never use Date.parse / new Date(string) on CSV values: browsers read
// "2026-07-17 18:39:19" in the *viewer's* local time. We parse explicitly
// and treat timestamps without a zone as UTC.
import type { TzKind } from './types.ts'

export const DAY_MS = 86_400_000

const TS_RE =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[Tt ]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*([Zz]|(?:UTC|GMT)?[+-]\d{2}(?::?\d{2})?|UTC|GMT)?$/

export interface ParsedTimestamp {
  ms: number
  tz: TzKind
  /** Offset written in the string, in minutes (0 for Z, null when naive). */
  offsetMin: number | null
}

export function parseTimestamp(raw: string | null | undefined): ParsedTimestamp | null {
  if (raw == null) return null
  const s = raw.trim()
  if (!s) return null
  const m = TS_RE.exec(s)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(m[4] ?? 0)
  const minute = Number(m[5] ?? 0)
  const second = Number(m[6] ?? 0)
  const millis = m[7] ? Math.floor(Number(`0.${m[7]}`) * 1000) : 0
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null

  // Reject impossible dates such as 2026-02-30 (Date.UTC would roll them over).
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null

  let ms = Date.UTC(year, month - 1, day, hour, minute, second, millis)
  const zone = m[8]?.toUpperCase()
  if (!zone) return { ms, tz: 'naive', offsetMin: null }
  if (zone === 'Z' || zone === 'UTC' || zone === 'GMT') return { ms, tz: 'utc', offsetMin: 0 }

  const z = zone.replace(/^(UTC|GMT)/, '')
  const sign = z[0] === '-' ? -1 : 1
  const digits = z.slice(1).replace(':', '')
  const oh = Number(digits.slice(0, 2))
  const om = digits.length > 2 ? Number(digits.slice(2, 4)) : 0
  if (oh > 14 || om > 59) return null
  const offsetMin = sign * (oh * 60 + om)
  ms -= offsetMin * 60_000
  return { ms, tz: 'offset', offsetMin }
}

/** UTC calendar day, YYYY-MM-DD. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Start of a UTC day given as YYYY-MM-DD. */
export function dayStart(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** End (last millisecond) of a UTC day given as YYYY-MM-DD. */
export function dayEnd(day: string): number {
  return dayStart(day) + DAY_MS - 1
}

/** Monday of the UTC week containing ms, as YYYY-MM-DD. */
export function utcWeekStart(ms: number): string {
  const d = new Date(ms)
  const sinceMonday = (d.getUTCDay() + 6) % 7
  return utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday))
}

export function addDays(day: string, n: number): string {
  return utcDay(dayStart(day) + n * DAY_MS)
}

export function elapsedDays(from: number, to: number): number {
  return (to - from) / DAY_MS
}
