import { Bell, ClipboardList, Database, House, Search, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useDerived } from '../app/derived.tsx'
import { navigate } from '../app/router.ts'
import type { Model } from '../data/types.ts'

interface NavItem {
  path: string
  section: string
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { path: '/', section: '', label: 'Overview', icon: House },
  { path: '/turnaround', section: 'turnaround', label: 'Turnaround', icon: Timer },
  { path: '/follow-up', section: 'follow-up', label: 'Follow-up', icon: Bell },
  { path: '/orders', section: 'orders', label: 'Orders', icon: ClipboardList },
  { path: '/data', section: 'data', label: 'Data', icon: Database },
]

/** Exact order / kit / customer id → that order; anything else → the order list, searched. */
function resolveSearch(model: Model, raw: string): { path: string; q?: string } {
  for (const term of [raw, raw.toLowerCase()]) {
    if (model.byOrderId.has(term)) return { path: `/orders/${encodeURIComponent(term)}` }
    const kits = model.byKitId.get(term)
    if (kits?.length) return { path: `/orders/${encodeURIComponent(kits[0].orderId)}` }
    const orders = model.byCustomerId.get(term)
    if (orders?.length === 1) return { path: `/orders/${encodeURIComponent(orders[0].order.orderId)}` }
  }
  return { path: '/orders', q: raw }
}

export function TopNav() {
  const { model, loc, linkTo, overdueCount } = useDerived()
  const section = loc.path.split('/')[1] ?? ''
  const [term, setTerm] = useState('')

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    const t = term.trim()
    if (!t) return
    const target = resolveSearch(model, t)
    const url = linkTo(target.path, { q: target.q ?? null }).slice(1)
    const i = url.indexOf('?')
    navigate(i < 0 ? url : url.slice(0, i), i < 0 ? '' : url.slice(i + 1))
    setTerm('')
  }

  return (
    <header className="sticky top-0 z-40 bg-surface shadow-[0_1px_0_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex h-[52px] max-w-[1128px] items-center gap-2 px-4">
        <a href={linkTo('/')} className="flex shrink-0 items-center gap-2" aria-label="Kit Ops overview">
          <span className="flex size-[34px] items-center justify-center rounded bg-brand text-[19px] font-bold text-white">N</span>
          <span className="hidden text-sm leading-tight font-semibold text-ink lg:block">
            Kit Ops
            <span className="block text-[11px] font-normal text-ink-2">Nebula Genomics</span>
          </span>
        </a>
        <form onSubmit={onSearch} role="search" className="relative ml-1 min-w-0 flex-1 md:ml-2 md:max-w-[280px]">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2" aria-hidden />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search order, kit or customer ID"
            aria-label="Search by order, kit or customer ID"
            className="h-[34px] w-full rounded bg-search pr-3 pl-9 text-sm text-ink placeholder:text-ink-2 focus:bg-surface focus:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.6)] focus:outline-none"
          />
        </form>
        <nav aria-label="Main" className="ml-auto flex h-full items-stretch">
          {NAV.map((item) => {
            const active = item.section === section
            const Icon = item.icon
            return (
              <a
                key={item.path}
                href={linkTo(item.path)}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                className={`relative flex min-w-[40px] flex-col items-center justify-center px-1 sm:min-w-[64px] md:min-w-[80px] ${
                  active
                    ? 'text-ink after:absolute after:inset-x-1 after:bottom-0 after:h-[2px] after:bg-ink'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                <span className="relative">
                  <Icon size={24} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {item.section === 'follow-up' && overdueCount > 0 && (
                    <span className="absolute -top-1 -right-3 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] leading-[18px] font-semibold text-white">
                      {overdueCount > 99 ? '99+' : overdueCount}
                    </span>
                  )}
                </span>
                <span className="hidden text-xs md:block">{item.label}</span>
              </a>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
