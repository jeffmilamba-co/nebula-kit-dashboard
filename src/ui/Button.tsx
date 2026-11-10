import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'tertiary'
type Size = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-[background-color,box-shadow,color] disabled:opacity-50'
const SIZES: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-9 px-4 text-base' }
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary:
    'text-brand shadow-[inset_0_0_0_1px_var(--color-brand)] hover:bg-brand-soft hover:shadow-[inset_0_0_0_2px_var(--color-brand)]',
  tertiary: 'text-ink-2 hover:bg-hover hover:text-ink',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'sm', extra = ''): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${extra}`
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />
}

export function ButtonLink({
  variant = 'secondary',
  size = 'sm',
  className = '',
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return <a className={buttonClass(variant, size, className)} {...props} />
}

/** LinkedIn job-search style filter pill: grey outline, solid green when active. */
export function pillClass(active: boolean): string {
  return `inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-[background-color,box-shadow,color] ${
    active
      ? 'bg-pill text-white hover:bg-pill-hover'
      : 'text-ink-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.6)] hover:bg-hover hover:text-ink hover:shadow-[inset_0_0_0_2px_rgba(0,0,0,0.75)]'
  }`
}
