import { describe, expect, it } from 'vitest'
import { parseTimestamp, utcDay, utcWeekStart } from '../time.ts'

describe('test environment', () => {
  it('runs in a non-UTC timezone so local-time parsing bugs surface', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(0)
  })
})

describe('parseTimestamp', () => {
  it('parses Z timestamps as UTC', () => {
    expect(parseTimestamp('2026-07-17T18:39:19Z')).toEqual({ ms: Date.UTC(2026, 6, 17, 18, 39, 19), tz: 'utc', offsetMin: 0 })
  })

  it('applies explicit offsets', () => {
    expect(parseTimestamp('2026-07-17T18:39:19-05:00')).toEqual({
      ms: Date.UTC(2026, 6, 17, 23, 39, 19),
      tz: 'offset',
      offsetMin: -300,
    })
    expect(parseTimestamp('2026-07-17T18:39:19+1000')?.ms).toBe(Date.UTC(2026, 6, 17, 8, 39, 19))
    expect(parseTimestamp('2026-07-17T18:39:19+01')?.ms).toBe(Date.UTC(2026, 6, 17, 17, 39, 19))
  })

  it('reads naive timestamps as UTC regardless of the machine timezone', () => {
    expect(parseTimestamp('2026-07-17 18:39:19')).toEqual({ ms: Date.UTC(2026, 6, 17, 18, 39, 19), tz: 'naive', offsetMin: null })
  })

  it('maps the same instant written three ways to one value', () => {
    const a = parseTimestamp('2026-09-29T19:13:34Z')?.ms
    expect(parseTimestamp('2026-09-29T15:13:34-04:00')?.ms).toBe(a)
    expect(parseTimestamp('2026-09-29 19:13:34')?.ms).toBe(a)
  })

  it('handles fractional seconds, date-only values and surrounding whitespace', () => {
    expect(parseTimestamp('2026-07-17T18:39:19.5Z')?.ms).toBe(Date.UTC(2026, 6, 17, 18, 39, 19, 500))
    expect(parseTimestamp(' 2026-07-17 ')).toEqual({ ms: Date.UTC(2026, 6, 17), tz: 'naive', offsetMin: null })
  })

  it('rejects invalid or unsupported values', () => {
    for (const bad of ['', '   ', 'garbage', '2026-02-30T00:00:00Z', '2026-13-01', '10/14/2026 15:53', '2026-07-17T25:00:00Z']) {
      expect(parseTimestamp(bad)).toBeNull()
    }
    expect(parseTimestamp(undefined)).toBeNull()
  })
})

describe('UTC day and week keys', () => {
  it('uses the UTC calendar day, not the local one', () => {
    const ms = parseTimestamp('2026-05-01T09:00:00+10:00')!.ms
    expect(utcDay(ms)).toBe('2026-04-30')
  })

  it('starts weeks on Monday', () => {
    expect(utcWeekStart(Date.UTC(2026, 10, 9, 12))).toBe('2026-11-09') // Monday
    expect(utcWeekStart(Date.UTC(2026, 10, 8, 23, 59))).toBe('2026-11-02') // Sunday
    expect(utcWeekStart(Date.UTC(2026, 10, 15))).toBe('2026-11-09') // Sunday
  })
})

describe('calendar arithmetic (no Date objects on the hot path)', () => {
  it('applies the Gregorian leap-year rules and rejects two-digit years', () => {
    expect(parseTimestamp('2024-02-29T00:00:00Z')).not.toBeNull()
    expect(parseTimestamp('2000-02-29')).not.toBeNull()
    expect(parseTimestamp('2026-02-29')).toBeNull()
    expect(parseTimestamp('2100-02-29')).toBeNull()
    expect(parseTimestamp('2026-04-31')).toBeNull()
    expect(parseTimestamp('0026-05-01T00:00:00Z')).toBeNull()
  })

  it('agrees with Date for every day across decades, including before 1970', () => {
    for (let ms = Date.UTC(1965, 0, 1, 13); ms < Date.UTC(2035, 0, 1); ms += 86_400_000 * 0.77) {
      const d = new Date(ms)
      expect(utcDay(ms)).toBe(d.toISOString().slice(0, 10))
      const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
      expect(utcWeekStart(ms)).toBe(new Date(monday).toISOString().slice(0, 10))
    }
  })
})
