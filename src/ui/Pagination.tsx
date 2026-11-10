import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fmtInt } from '../lib/format.ts'
import { Button } from './Button.tsx'

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex items-center justify-between gap-2 rounded-b-lg border-t border-line px-4 py-2 text-xs text-ink-2">
      <span className="tabular-nums">
        {fmtInt(from)}–{fmtInt(to)} of {fmtInt(total)}
      </span>
      <span className="flex items-center gap-1">
        <Button variant="tertiary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={16} aria-hidden /> Previous
        </Button>
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        <Button variant="tertiary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight size={16} aria-hidden />
        </Button>
      </span>
    </div>
  )
}
