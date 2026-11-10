// Web Worker entry: reads, parses and models two CSVs, then streams the model back to the page
// in batches (see loader.ts for why). Everything this file allocates — the file text, the parsed
// rows — is freed when the page terminates the worker after the load.
import { LoadError } from '../data/loadError.ts'
import { loadDataset } from '../data/pipeline.ts'
import type { LoaderMessage, LoaderRequest } from './loader.ts'

// A worker posts to the page that created it; there is no target origin to give.
// oxlint-disable-next-line unicorn/require-post-message-target-origin
const post = (msg: LoaderMessage) => postMessage(msg)

addEventListener('message', async (ev: MessageEvent<LoaderRequest>) => {
  const { sources, batchSize } = ev.data
  try {
    if (sources.length !== 2) throw new LoadError([`Expected two files, got ${sources.length}.`])
    const texts = await Promise.all(sources.map((s) => s.blob.text()))
    const model = loadDataset({ name: sources[0].name, text: texts[0] }, { name: sources[1].name, text: texts[1] })
    const { orphans, maxTimestamp, options, quality, source, records } = model
    post({ type: 'head', head: { orphans, maxTimestamp, options, quality, source } })
    for (let i = 0; i < records.length; i += batchSize) post({ type: 'records', records: records.slice(i, i + batchSize) })
    post({ type: 'done' })
  } catch (err) {
    post({ type: 'error', messages: err instanceof LoadError ? err.messages : [err instanceof Error ? err.message : String(err)] })
  }
})
