import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LoadError, loadDataset } from '../data/pipeline.ts'
import type { Model } from '../data/types.ts'

interface DataState {
  status: 'loading' | 'ready' | 'error'
  model: Model | null
  error: string[] | null
  isSample: boolean
  busy: boolean
}

export interface DataApi extends DataState {
  /** Returns error messages, or null on success. The current dataset stays loaded on failure. */
  loadFiles: (files: File[]) => Promise<string[] | null>
  loadSample: () => Promise<void>
}

const DataContext = createContext<DataApi | null>(null)

async function fetchText(path: string): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!res.ok) throw new Error(`Couldn’t load ${path} (HTTP ${res.status}).`)
  return res.text()
}

/** Let the browser paint the "loading" state before the synchronous parse. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: 'loading', model: null, error: null, isSample: true, busy: true })

  const loadSample = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }))
    try {
      const [orders, events] = await Promise.all([fetchText('data/orders.csv'), fetchText('data/kit_events.csv')])
      await nextFrame()
      const model = loadDataset({ name: 'orders.csv', text: orders }, { name: 'kit_events.csv', text: events })
      setState({ status: 'ready', model, error: null, isSample: true, busy: false })
    } catch (err) {
      const error = err instanceof LoadError ? err.messages : [messageOf(err)]
      setState((s) => ({ ...s, status: s.model ? 'ready' : 'error', error, busy: false }))
    }
  }, [])

  const loadFiles = useCallback(async (files: File[]) => {
    if (files.length !== 2) {
      return [`Please choose two files: the orders export and the kit events export (you chose ${files.length}).`]
    }
    setState((s) => ({ ...s, busy: true }))
    try {
      const texts = await Promise.all(files.map((f) => f.text()))
      await nextFrame()
      const model = loadDataset({ name: files[0].name, text: texts[0] }, { name: files[1].name, text: texts[1] })
      setState({ status: 'ready', model, error: null, isSample: false, busy: false })
      return null
    } catch (err) {
      setState((s) => ({ ...s, busy: false }))
      return err instanceof LoadError ? err.messages : [messageOf(err)]
    }
  }, [])

  useEffect(() => {
    void loadSample()
  }, [loadSample])

  const api = useMemo<DataApi>(() => ({ ...state, loadFiles, loadSample }), [state, loadFiles, loadSample])
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>
}

export function useData(): DataApi {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}
