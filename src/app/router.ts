// Tiny hash router: the URL hash is the single source of truth for route + filters,
// so every view is deep-linkable and no server rewrites are needed on the host.
import { useSyncExternalStore } from 'react'

export interface Loc {
  path: string
  query: string
}

function read(): Loc {
  const h = window.location.hash.replace(/^#/, '')
  const i = h.indexOf('?')
  const rawPath = (i < 0 ? h : h.slice(0, i)) || '/'
  return { path: rawPath.startsWith('/') ? rawPath : `/${rawPath}`, query: i < 0 ? '' : h.slice(i + 1) }
}

let current = read()
const listeners = new Set<() => void>()

function update() {
  const next = read()
  if (next.path !== current.path || next.query !== current.query) {
    current = next
    listeners.forEach((l) => l())
  }
}

window.addEventListener('hashchange', update)
window.addEventListener('popstate', update)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => current

export function useLocation(): Loc {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function href(path: string, query?: string | URLSearchParams): string {
  const q = typeof query === 'string' ? query : (query?.toString() ?? '')
  return `#${path}${q ? `?${q}` : ''}`
}

/** pushState/replaceState don't fire hashchange, so notify subscribers ourselves. */
export function navigate(path: string, query?: string | URLSearchParams, opts: { replace?: boolean } = {}): void {
  const target = href(path, query)
  if (target === window.location.hash) return
  if (opts.replace) window.history.replaceState(window.history.state, '', target)
  else {
    window.history.pushState(window.history.state, '', target)
    window.scrollTo(0, 0)
  }
  update()
}
