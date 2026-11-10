import { Ban, CircleCheck, Clock, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Health } from '../data/types.ts'
import { HEALTH_LABEL } from '../lib/colors.ts'

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'bg-[#eef0f2] text-ink-2',
  brand: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  )
}

const HEALTH_TONE: Record<Health, Tone> = { on_track: 'brand', at_risk: 'warning', overdue: 'danger', closed: 'neutral' }

export function HealthIcon({ health, size = 14 }: { health: Health; size?: number }) {
  if (health === 'overdue') return <TriangleAlert size={size} aria-hidden />
  if (health === 'at_risk') return <Clock size={size} aria-hidden />
  if (health === 'closed') return <Ban size={size} aria-hidden />
  return <CircleCheck size={size} aria-hidden />
}

/** Status always ships with an icon and a label, never color alone. */
export function HealthBadge({ health }: { health: Health | null }) {
  if (!health) return null
  return (
    <Badge tone={HEALTH_TONE[health]}>
      <HealthIcon health={health} size={12} />
      {HEALTH_LABEL[health]}
    </Badge>
  )
}
