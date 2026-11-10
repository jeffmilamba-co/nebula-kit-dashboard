import type { ReactNode } from 'react'

/** LinkedIn home-feed layout: 225px left rail, flexible feed, 300px right rail. */
export function ThreeColumn({ left, right, children }: { left: ReactNode; right: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1128px] grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[225px_minmax(0,1fr)] lg:grid-cols-[225px_minmax(0,1fr)_300px]">
      <aside className="flex flex-col gap-2 md:sticky md:top-[112px] md:self-start">{left}</aside>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
      <aside className="flex min-w-0 flex-col gap-2 md:col-span-2 lg:col-span-1">{right}</aside>
    </div>
  )
}

/** Main column with a 300px right rail (analytics pages). */
export function MainWithRail({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1128px] grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
      <aside className="flex min-w-0 flex-col gap-2">{rail}</aside>
    </div>
  )
}

/** 225px left rail with a wide main column (My Network style). */
export function RailWithMain({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1128px] grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[225px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-2 md:sticky md:top-[112px] md:self-start">{rail}</aside>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </div>
  )
}
