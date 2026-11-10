// Route → page component, each page in its own chunk (Recharts, the heaviest dependency, only ships
// with the overview). The current page starts downloading at startup, in parallel with the data;
// the others are fetched when the browser is idle, so switching tabs never waits on the network.
import { use } from 'react'
import type { ComponentType } from 'react'

/**
 * Like React.lazy, but renders synchronously once the code has arrived. React.lazy always suspends
 * on its first render, even when the chunk is already loaded, and React then holds back the reveal
 * (by up to ~300 ms) — which would undo the point of preloading the page alongside the data.
 */
function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | null = null
  let pending: Promise<ComponentType<P>> | null = null
  const preload = () =>
    (pending ??= load().then(
      (c) => (loaded = c),
      (err: unknown) => {
        pending = null // let a later render retry (e.g. after a flaky network)
        throw err
      },
    ))
  function Page(props: P) {
    const C = loaded ?? use(preload())
    return <C {...props} />
  }
  return { Page, preload }
}

const pages = {
  overview: lazyPage(() => import('../views/OverviewView.tsx').then((m) => m.OverviewView)),
  turnaround: lazyPage(() => import('../views/TurnaroundView.tsx').then((m) => m.TurnaroundView)),
  followUp: lazyPage(() => import('../views/FollowUpView.tsx').then((m) => m.FollowUpView)),
  orders: lazyPage(() => import('../views/OrdersView.tsx').then((m) => m.OrdersView)),
  data: lazyPage(() => import('../views/DataView.tsx').then((m) => m.DataView)),
}

export const Pages = {
  Overview: pages.overview.Page,
  Turnaround: pages.turnaround.Page,
  FollowUp: pages.followUp.Page,
  Orders: pages.orders.Page,
  Data: pages.data.Page,
}

const BY_SECTION: Record<string, keyof typeof pages> = {
  '': 'overview',
  turnaround: 'turnaround',
  'follow-up': 'followUp',
  orders: 'orders',
  data: 'data',
}

/** First path segment: '/orders/ord_1' → 'orders', '/' → ''. */
export const sectionOf = (path: string) => path.split('/')[1] ?? ''

const ignore = () => {} // a failed download resurfaces, and is handled, when the page renders

/** Starts downloading the page for a route. */
export function preloadPage(path: string): void {
  const key = BY_SECTION[sectionOf(path)]
  if (key) pages[key].preload().catch(ignore)
}

const preloadAll = () => Object.values(pages).forEach((p) => p.preload().catch(ignore))

/** Fetches every page's code once the browser is idle. Returns a cancel function. */
export function prefetchAllPages(): () => void {
  if ('requestIdleCallback' in window) {
    const id = requestIdleCallback(preloadAll, { timeout: 3000 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(preloadAll, 1500)
  return () => clearTimeout(id)
}
