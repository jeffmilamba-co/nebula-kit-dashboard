type Cell = string | number | null

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)$/

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (=, +, -, @, tab or CR first; the
 * CSV/formula-injection risk with exports built from uploaded files) is prefixed with an
 * apostrophe so it stays text. Plain numbers, including negative ones such as "-1.5", are untouched.
 * Then RFC 4180 quoting.
 */
export function csvCell(v: Cell): string {
  let s = v == null ? '' : String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

/** Build a CSV and hand it to the browser as a download. */
export function downloadCsv(filename: string, header: string[], rows: Cell[][]): void {
  const blob = new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
