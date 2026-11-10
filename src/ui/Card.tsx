import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function Card({ className = '', children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className={`rounded-lg bg-surface shadow-card ${className}`}>
      {children}
    </section>
  )
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** LinkedIn's "Show all →" footer row. */
export function CardFooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="flex items-center justify-center gap-1 rounded-b-lg border-t border-line px-4 py-3 text-sm font-semibold text-ink-2 hover:bg-hover hover:text-ink"
    >
      {children}
      <ArrowRight size={16} aria-hidden />
    </a>
  )
}

export function Legend({ items }: { items: { color: string; label: string; icon?: ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 text-xs text-ink-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: it.color }} aria-hidden />
          {it.icon}
          {it.label}
        </li>
      ))}
    </ul>
  )
}
