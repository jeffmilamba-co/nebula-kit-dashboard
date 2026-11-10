import { Ban, CircleCheck, CircleDot, Dna, FileText, FileUp, Microscope, Package, RefreshCw, Send, Truck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Stage } from '../data/types.ts'

const ICONS: Record<Stage, LucideIcon> = {
  awaiting_shipment: Package,
  to_customer: Truck,
  with_customer: Users,
  to_lab: Send,
  lab_qc: Microscope,
  sequencing: Dna,
  reporting: FileText,
  awaiting_replacement: RefreshCw,
  complete: CircleCheck,
  not_shipped: Ban,
  no_kit: FileUp,
  unknown: CircleDot,
}

export function StageIcon({ stage, size = 16, className = '' }: { stage: Stage; size?: number; className?: string }) {
  const Icon = ICONS[stage]
  return <Icon size={size} className={className} aria-hidden />
}
