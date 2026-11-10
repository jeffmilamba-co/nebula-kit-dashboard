// Shared e2e helpers. Expected numbers come from the app's own data layer run in Node on the
// same CSVs, so these tests check that the UI shows, filters and reloads exactly what the
// (separately unit-tested) data layer computes.
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { compileFilter, defaultFilters } from '../src/data/filters.ts'
import { followUpQueue } from '../src/data/followup.ts'
import { kpis, stageDistribution, weeklyVolume } from '../src/data/metrics.ts'
import { stageStats } from '../src/data/stats.ts'
import { loadDataset } from '../src/data/pipeline.ts'
import { buildSnapshot } from '../src/data/state.ts'
import type { Filters, Model } from '../src/data/types.ts'
import { fmtInt } from '../src/lib/format.ts'

/** Fails any test that logs a console error or throws in the page. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`)
      })
      await use(errors)
      expect(errors, 'browser console errors').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

export const sample: Model = loadDataset(
  { name: 'orders.csv', text: read('public/data/orders.csv') },
  { name: 'kit_events.csv', text: read('public/data/kit_events.csv') },
)

// Independent oracle: order counts straight from the raw sample CSV (plain split, explicit-offset
// timestamps), so a bug shared by the app and expectedView() still fails the filter tests.
const RAW_ORDERS = read('public/data/orders.csv')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [, created, , product, country, status, isTest] = line.split(',')
    return { product, country, status, isTest: isTest === 'true', day: new Date(created).toISOString().slice(0, 10) }
  })

export function rawOrderCount(f: {
  products?: string[]
  countries?: string[]
  statuses?: string[] | null
  includeTest?: boolean
  from?: string
  to?: string
}): number {
  const statuses = f.statuses === undefined ? ['paid'] : f.statuses
  return RAW_ORDERS.filter(
    (o) =>
      (f.includeTest || !o.isTest) &&
      (!statuses || statuses.includes(o.status)) &&
      (!f.products || f.products.includes(o.product)) &&
      (!f.countries || f.countries.includes(o.country)) &&
      (!f.from || o.day >= f.from) &&
      (!f.to || o.day <= f.to),
  ).length
}

/** What the app should show for a dataset, filters and as-of moment. */
export function expectedView(model: Model, overrides: Partial<Filters> = {}, asOf = model.maxTimestamp) {
  const filters = { ...defaultFilters(model.options), ...overrides }
  const pred = compileFilter(filters)
  const visible = buildSnapshot(model, asOf).filter((s) => pred(s.rec.order))
  const queue = followUpQueue(visible, { includeAtRisk: true })
  return {
    kpis: kpis(visible),
    stages: stageDistribution(visible),
    weeks: weeklyVolume(visible).length,
    turnaround: stageStats(visible).get('all') ?? [],
    overdue: queue.filter((i) => i.snap.health === 'overdue'),
    atRisk: queue.filter((i) => i.snap.health === 'at_risk'),
  }
}

export const n = fmtInt

/** Opens a route and waits until the sample data has loaded. */
export async function open(page: Page, hash = '#/') {
  // Relative to baseURL, so it also works when the app lives under a sub-path (GitHub Pages).
  await page.goto(hash)
  // First load fetches ~0.9 MB (gzipped JS + sample CSVs); allow for a slow link to a deployed copy.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 30_000 })
}

/** The big number on a KPI tile (tile = label, value, sub-line). */
export const kpiValue = (page: Page, label: string) =>
  page.getByRole('group', { name: label, exact: true }).locator(':scope > div').nth(1)

export const heading1 = (page: Page) => page.getByRole('heading', { level: 1 })
