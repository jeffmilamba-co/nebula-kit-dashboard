// Loads a dataset off the main thread. A Web Worker reads, parses and models the two CSVs (the
// expensive part: ~1 s for 50k orders), then streams the model back in batches of records.
// Batching matters: deserializing a structured-clone message happens in one main-thread task,
// and the whole model at that size would block the page for ~0.5 s; batches keep each task short.
import { LoadError } from '../data/loadError.ts'
import { assembleModel } from '../data/model.ts'
import type { ModelHead } from '../data/model.ts'
import type { Model, OrderRecord } from '../data/types.ts'

export interface LoadSource {
  name: string
  /** A File from an upload, or a Blob of a fetched file. Blobs are passed to the worker by reference. */
  blob: Blob
}

export interface LoaderRequest {
  sources: LoadSource[]
  batchSize: number
}

export type LoaderMessage =
  | { type: 'head'; head: ModelHead }
  | { type: 'records'; records: OrderRecord[] }
  | { type: 'done' }
  | { type: 'error'; messages: string[] }

/** Orders per message: ~10 ms to deserialize on a laptop, so the page stays responsive between batches. */
const BATCH_SIZE = 1000

/**
 * Builds a Model from two CSV files in a Web Worker. Takes the sources as a promise so the worker
 * can start (download and compile its code) while the files are still being fetched.
 * Aborting the signal terminates the worker, so a superseded load stops using CPU and its memory
 * is released straight away.
 */
export function loadModel(sourcesReady: Promise<LoadSource[]>, signal: AbortSignal): Promise<Model> {
  if (typeof Worker === 'undefined') return sourcesReady.then(loadOnMainThread)
  return new Promise<Model>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./loader.worker.ts', import.meta.url), { type: 'module', name: 'dataset-loader' })
    } catch {
      sourcesReady.then(loadOnMainThread).then(resolve, reject)
      return
    }
    let head: ModelHead | null = null
    const records: OrderRecord[] = []
    const settle = () => {
      worker.terminate()
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      settle()
      reject(signal.reason)
    }
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })

    worker.addEventListener('message', (ev: MessageEvent<LoaderMessage>) => {
      const msg = ev.data
      switch (msg.type) {
        case 'head':
          head = msg.head
          break
        case 'records':
          for (const r of msg.records) records.push(r)
          break
        case 'done':
          settle()
          if (head) resolve(assembleModel(head, records))
          else reject(new Error('The loader finished without sending any data.'))
          break
        case 'error':
          settle()
          reject(new LoadError(msg.messages))
          break
      }
    })
    worker.addEventListener('messageerror', () => {
      settle()
      reject(new Error('Couldn’t read the data sent back by the loader.'))
    })
    worker.addEventListener('error', (ev) => {
      // The worker script couldn't start (e.g. blocked by the host) or crashed. If nothing has
      // arrived yet, fall back to loading on the main thread rather than failing.
      ev.preventDefault()
      settle()
      if (head) reject(new Error(`The loader stopped unexpectedly: ${ev.message || 'unknown error'}.`))
      else sourcesReady.then(loadOnMainThread).then(resolve, reject)
    })
    sourcesReady.then(
      (sources) => {
        // Worker#postMessage has no target origin (the rule assumes window.postMessage).
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        if (!signal.aborted) worker.postMessage({ sources, batchSize: BATCH_SIZE } satisfies LoaderRequest)
      },
      (err: unknown) => {
        settle()
        reject(err)
      },
    )
  })
}

/** Same pipeline in the page; the parser is only downloaded if this path is ever taken. */
async function loadOnMainThread(sources: LoadSource[]): Promise<Model> {
  if (sources.length !== 2) throw new LoadError([`Expected two files, got ${sources.length}.`])
  const [{ loadDataset }, texts] = await Promise.all([import('../data/pipeline.ts'), Promise.all(sources.map((s) => s.blob.text()))])
  return loadDataset({ name: sources[0].name, text: texts[0] }, { name: sources[1].name, text: texts[1] })
}
