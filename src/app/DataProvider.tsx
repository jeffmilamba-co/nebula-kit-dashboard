import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { LoadError } from '../data/loadError.ts'
import type { Model } from '../data/types.ts'
import { loadModel } from './loader.ts'
import type { LoadSource } from './loader.ts'

interface DataState {
  status: 'loading' | 'ready' | 'error'
  model: Model | null
  error: string[] | null
  isSample: boolean
  busy: boolean
}

/** `cancelled`: a newer load (another upload, or restoring the sample) replaced this one. */
export type LoadResult = { status: 'loaded' } | { status: 'failed'; errors: string[] } | { status: 'cancelled' }

export interface DataApi extends DataState {
  /** Loads an uploaded pair of files. On failure the current dataset stays loaded. */
  loadFiles: (files: File[]) => Promise<LoadResult>
  loadSample: () => Promise<LoadResult>
}

const DataContext = createContext<DataApi | null>(null)

const SAMPLE_FILES = ['orders.csv', 'kit_events.csv']

/**
 * The bundled sample, fetched as soon as the app mounts (the entry bundle is small, so that is early).
 * Deliberately not a <link rel=preload as=fetch> in index.html: in Chrome 157, taking over a
 * still-downloading preload of the 1.8 MB events file intermittently failed with "Failed to fetch".
 */
function fetchSample(signal: AbortSignal): Promise<LoadSource[]> {
  return Promise.all(
    SAMPLE_FILES.map(async (name) => {
      const path = `data/${name}`
      const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal })
      if (!res.ok) throw new Error(`Couldn’t load ${path} (HTTP ${res.status}).`)
      return { name, blob: await res.blob() }
    }),
  )
}

const messagesOf = (err: unknown) => (err instanceof LoadError ? err.messages : [err instanceof Error ? err.message : String(err)])

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: 'loading', model: null, error: null, isSample: true, busy: true })
  const inFlight = useRef<AbortController | null>(null)

  /** Runs one load. Starting another cancels it: the latest request always wins. */
  const run = useCallback(async (getSources: (signal: AbortSignal) => Promise<LoadSource[]>, isSample: boolean): Promise<LoadResult> => {
    inFlight.current?.abort()
    const ctrl = new AbortController()
    inFlight.current = ctrl
    setState((s) => (s.busy ? s : { ...s, busy: true })) // same object when already busy: no re-render
    try {
      const model = await loadModel(getSources(ctrl.signal), ctrl.signal)
      if (ctrl.signal.aborted) return { status: 'cancelled' }
      // A transition lets React render the new dataset in slices, yielding to the browser in between,
      // instead of one long task for every view, chart and derived list at once.
      startTransition(() => setState({ status: 'ready', model, error: null, isSample, busy: false }))
      return { status: 'loaded' }
    } catch (err) {
      if (ctrl.signal.aborted) return { status: 'cancelled' }
      const errors = messagesOf(err)
      // A failed upload leaves the current dataset in place; a failed sample load with nothing loaded is fatal.
      setState((s) => ({ ...s, status: s.model ? 'ready' : 'error', error: isSample ? errors : s.error, busy: false }))
      return { status: 'failed', errors }
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null
    }
  }, [])

  const loadSample = useCallback(() => run(fetchSample, true), [run])

  const loadFiles = useCallback(
    async (files: File[]): Promise<LoadResult> => {
      if (files.length !== 2) {
        return {
          status: 'failed',
          errors: [`Please choose two files: the orders export and the kit events export (you chose ${files.length}).`],
        }
      }
      return run(async () => files.map((f) => ({ name: f.name, blob: f })), false)
    },
    [run],
  )

  useEffect(() => {
    // The state starts busy, so this first load's busy update bails out without a render.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadSample()
    return () => inFlight.current?.abort()
  }, [loadSample])

  const api = useMemo<DataApi>(() => ({ ...state, loadFiles, loadSample }), [state, loadFiles, loadSample])
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>
}

export function useData(): DataApi {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}
