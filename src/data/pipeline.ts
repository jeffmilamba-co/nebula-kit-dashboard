// Entry point: two CSV texts in, a Model out. Takes strings (not Files) so it runs in Node tests
// and could move into a Web Worker unchanged.
import { detectKind, missingColumns, parseCsv } from './csv.ts'
import type { CsvTable, FileKind } from './csv.ts'
import { buildModel } from './model.ts'
import { normalizeEvents, normalizeOrders } from './normalize.ts'
import type { Model } from './types.ts'

export interface NamedText {
  name: string
  text: string
}

export class LoadError extends Error {
  readonly messages: string[]
  constructor(messages: string[]) {
    super(messages.join('\n'))
    this.name = 'LoadError'
    this.messages = messages
  }
}

const KIND_LABEL: Record<FileKind, string> = { orders: 'orders', events: 'kit events' }

export function loadDataset(a: NamedText, b: NamedText): Model {
  const parsed = [a, b].map((f) => ({ file: f, table: parseCsv(f.text) }))
  const errors: string[] = []
  const kinds = parsed.map(({ file, table }) => {
    const kind = detectKind(table.headers)
    if (!kind) {
      errors.push(
        `${file.name}: couldn’t tell whether this is the orders file or the kit events file (columns: ${table.headers.join(', ') || 'none'}).`,
      )
    }
    return kind
  })
  if (kinds[0] && kinds[0] === kinds[1]) {
    errors.push(`Both files look like ${KIND_LABEL[kinds[0]]} files. Please provide one orders file and one kit events file.`)
  }
  if (errors.length) throw new LoadError(errors)

  const ordersIdx = kinds[0] === 'orders' ? 0 : 1
  const orders = parsed[ordersIdx]
  const events = parsed[1 - ordersIdx]
  const check = (kind: FileKind, f: { file: NamedText; table: CsvTable }) => {
    const missing = missingColumns(kind, f.table.headers)
    if (missing.length) errors.push(`${f.file.name}: missing required column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`)
  }
  check('orders', orders)
  check('events', events)
  if (errors.length) throw new LoadError(errors)

  const o = normalizeOrders(orders.table.rows)
  const e = normalizeEvents(events.table.rows)
  if (o.orders.length === 0) throw new LoadError([`${orders.file.name}: no usable order rows.`])

  return buildModel({
    orders: o.orders,
    events: e.events,
    ordersMeta: { rows: orders.table.rows.length, missingId: o.missingId, badDate: o.badDate, duplicateIds: o.duplicateIds },
    eventsMeta: {
      rows: events.table.rows.length,
      missingFields: e.missingFields,
      badTimestamp: e.badTimestamp,
      badTimestampSamples: e.badTimestampSamples,
      tzCounts: e.tzCounts,
    },
    names: { ordersName: orders.file.name, eventsName: events.file.name },
  })
}
