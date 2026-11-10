import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '../download.ts'

describe('CSV export', () => {
  it('quotes per RFC 4180', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell(null)).toBe('')
  })

  it('keeps uploaded text from running as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe('"\'=HYPERLINK(""http://x"",""click"")"')
    expect(csvCell('+1+cmd|calc')).toBe("'+1+cmd|calc")
    expect(csvCell('-2+3')).toBe("'-2+3")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('\tTAB')).toBe("'\tTAB")
  })

  it('leaves numbers alone, including negative ones written as text', () => {
    expect(csvCell(-3)).toBe('-3')
    expect(csvCell('-1.5')).toBe('-1.5')
    expect(csvCell('+2')).toBe('+2')
    expect(csvCell('12.0')).toBe('12.0')
  })

  it('joins rows with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [null, '=1']])).toBe("a,b\r\n1,x\r\n,'=1")
  })
})
