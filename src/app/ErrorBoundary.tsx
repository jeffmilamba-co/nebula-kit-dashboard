import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from '../ui/Button.tsx'

interface Props {
  children: ReactNode
  /** Link shown as the way out ("Go to the overview"). */
  homeHref: string
  /** Clears a caught error when it changes (the route), without remounting the page otherwise. */
  resetKey: string
}

/** A chunk that no longer exists on the server: the tab is older than the latest deploy. */
const isStaleChunk = (e: Error) => /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(e.message)

/**
 * Contains a crash to the page it happened on, so the nav, filters and loaded data survive.
 * Navigating anywhere (a new resetKey) clears the error.
 */
interface State {
  error: Error | null
  /** The resetKey the current error belongs to. */
  resetKey: string | null
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  // Runs before render, so a new route shows its page straight away (no extra render pass).
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { resetKey: props.resetKey, error: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale = isStaleChunk(error)
    return (
      <div role="alert" className="mx-auto max-w-[560px] px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{stale ? 'A newer version of this dashboard is available' : 'This page hit a problem'}</h1>
        <p className="mt-2 text-sm text-ink-2">
          {stale
            ? 'Reload to get it. Your filters are kept in the address, so you’ll land back here.'
            : 'The rest of the dashboard still works. Reloading usually fixes it; if not, the details below help us find the cause.'}
        </p>
        {!stale && <pre className="mt-3 overflow-x-auto rounded bg-canvas p-3 text-left text-xs text-ink-2">{error.message}</pre>}
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <a className="inline-flex items-center px-3 font-semibold text-brand hover:underline" href={this.props.homeHref}>
            Go to the overview
          </a>
        </div>
      </div>
    )
  }
}
