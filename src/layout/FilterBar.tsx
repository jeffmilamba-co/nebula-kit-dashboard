import { Check } from 'lucide-react'
import { useMemo } from 'react'
import { useDerived } from '../app/derived.tsx'
import { defaultFilters, isDefault, normalizeList } from '../data/filters.ts'
import { addDays, utcDay } from '../data/time.ts'
import { countryLabel, fmtDateTime, fmtInt, fmtShortDay, productLabel, statusLabel } from '../lib/format.ts'
import { Button, pillClass } from '../ui/Button.tsx'
import { PillPopover } from '../ui/Popover.tsx'

function MultiPill({
  label,
  values,
  selected,
  counts,
  format,
  onChange,
}: {
  label: string
  values: string[]
  selected: string[] | null
  counts: Map<string, number>
  format: (v: string) => string
  onChange: (v: string[] | null) => void
}) {
  const text = !selected ? label : selected.length === 1 ? `${label}: ${format(selected[0])}` : `${label} (${selected.length})`
  return (
    <PillPopover label={text} active={selected !== null}>
      {(close) => (
        <div>
          <ul className="max-h-72 overflow-auto py-1">
            {values.map((v) => {
              const checked = selected?.includes(v) ?? false
              return (
                <li key={v}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-hover">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#01754f]"
                      checked={checked}
                      onChange={() => {
                        const cur = selected ?? []
                        onChange(normalizeList(checked ? cur.filter((x) => x !== v) : [...cur, v], values))
                      }}
                    />
                    <span className="flex-1">{format(v)}</span>
                    <span className="text-xs text-ink-3 tabular-nums">{fmtInt(counts.get(v) ?? 0)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
            <Button variant="tertiary" onClick={() => onChange(null)}>
              Clear
            </Button>
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </PillPopover>
  )
}

function DatePill() {
  const { filters, setFilters, asOf, model } = useDerived()
  const asOfDay = utcDay(asOf)
  const presets: { label: string; from: string | null }[] = [
    { label: 'All time', from: null },
    { label: 'Last 30 days', from: addDays(asOfDay, -29) },
    { label: 'Last 90 days', from: addDays(asOfDay, -89) },
    { label: 'Last 180 days', from: addDays(asOfDay, -179) },
  ]
  const activePreset = presets.find((p) => p.from === filters.from && (p.from === null ? filters.to === null : filters.to === asOfDay))
  const active = filters.from !== null || filters.to !== null
  const label = !active
    ? 'Order date'
    : activePreset
      ? activePreset.label
      : `${filters.from ? fmtShortDay(filters.from) : 'Start'} – ${filters.to ? fmtShortDay(filters.to) : 'now'}`
  return (
    <PillPopover label={label} active={active}>
      {(close) => (
        <div className="text-sm">
          <ul className="py-1">
            {presets.map((p) => {
              const selected = activePreset?.label === p.label || (!active && p.from === null)
              return (
                <li key={p.label}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover"
                    onClick={() => {
                      setFilters({ ...filters, from: p.from, to: p.from ? asOfDay : null })
                      close()
                    }}
                  >
                    <span className="w-4">{selected && <Check size={16} strokeWidth={3} aria-hidden />}</span>
                    {p.label}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-1 border-t border-line px-2 pt-2 pb-1">
            <div className="mb-1 text-xs font-semibold text-ink-2">Custom range (order date, UTC)</div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="From"
                className="h-8 rounded border border-line-strong px-2 text-sm"
                min={model.options.minDay ?? undefined}
                max={model.options.maxDay ?? undefined}
                value={filters.from ?? ''}
                onChange={(e) => setFilters({ ...filters, from: e.target.value || null })}
              />
              <span className="text-ink-2">–</span>
              <input
                type="date"
                aria-label="To"
                className="h-8 rounded border border-line-strong px-2 text-sm"
                min={model.options.minDay ?? undefined}
                max={model.options.maxDay ?? undefined}
                value={filters.to ?? ''}
                onChange={(e) => setFilters({ ...filters, to: e.target.value || null })}
              />
            </div>
          </div>
        </div>
      )}
    </PillPopover>
  )
}

export function FilterBar() {
  const { model, filters, setFilters, asOf, asOfOverridden, setQuery } = useDerived()
  const o = model.options
  const counts = useMemo(() => {
    const product = new Map<string, number>()
    const country = new Map<string, number>()
    const status = new Map<string, number>()
    const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
    for (const r of model.records) {
      inc(product, r.order.product)
      inc(country, r.order.country)
      inc(status, r.order.status)
    }
    return { product, country, status }
  }, [model])

  return (
    <div className="border-b border-line bg-surface md:sticky md:top-[52px] md:z-30">
      <div className="mx-auto flex max-w-[1128px] flex-wrap items-center gap-2 px-4 py-2">
        <DatePill />
        <MultiPill
          label="Product"
          values={o.products}
          selected={filters.products}
          counts={counts.product}
          format={productLabel}
          onChange={(products) => setFilters({ ...filters, products })}
        />
        <MultiPill
          label="Country"
          values={o.countries}
          selected={filters.countries}
          counts={counts.country}
          format={(c) => `${countryLabel(c)}${countryLabel(c) !== c ? ` (${c})` : ''}`}
          onChange={(countries) => setFilters({ ...filters, countries })}
        />
        <MultiPill
          label="Status"
          values={o.statuses}
          selected={filters.statuses}
          counts={counts.status}
          format={statusLabel}
          onChange={(statuses) => setFilters({ ...filters, statuses })}
        />
        <button
          type="button"
          aria-pressed={filters.includeTest}
          className={pillClass(filters.includeTest)}
          onClick={() => setFilters({ ...filters, includeTest: !filters.includeTest })}
        >
          {filters.includeTest && <Check size={16} aria-hidden />}
          Test orders
        </button>
        {!isDefault(filters, o) && (
          <Button variant="tertiary" onClick={() => setFilters(defaultFilters(o))}>
            Reset filters
          </Button>
        )}
        <span className="ml-auto text-xs text-ink-2">
          {asOfOverridden ? (
            <>
              Viewing as of <b className="text-ink">{fmtDateTime(asOf)}</b>{' '}
              <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setQuery({ asof: null })}>
                Back to latest
              </button>
            </>
          ) : (
            <>
              Data as of <b className="text-ink">{fmtDateTime(asOf)}</b>
            </>
          )}
        </span>
      </div>
    </div>
  )
}
