// One block per requirement in the challenge brief ("What to build"), run against the production build.
import { readFileSync } from 'node:fs'
import { addDays, dayEnd, utcDay } from '../src/data/time.ts'
import { expect, expectedView, heading1, kpiValue, n, open, rawOrderCount, sample, test } from './helpers.ts'

const base = expectedView(sample)

test.describe('Requirement 1: overall pipeline health (volume, where kits are, how many finished)', () => {
  test('overview headline numbers match the data', async ({ page }) => {
    await open(page)
    await expect(kpiValue(page, 'Orders')).toHaveText(n(rawOrderCount({})))
    await expect(kpiValue(page, 'In the pipeline')).toHaveText(n(base.kpis.inPipeline))
    await expect(kpiValue(page, 'Reports ready')).toHaveText(n(base.kpis.finished))
    await expect(page.getByRole('link', { name: /^Need follow-up/ }).locator(':scope > div').nth(1)).toHaveText(n(base.kpis.overdue))

    const where = page.getByRole('region', { name: 'Where kits are now' })
    for (const s of base.stages) {
      await expect(where.getByRole('link', { name: new RegExp(`^${s.label}: ${s.total} orders`) })).toBeVisible()
    }
    await expect(where).toContainText(`${n(base.kpis.finished)} orders have their report ready`)
  })

  test('weekly volume renders as a chart and as a table', async ({ page }) => {
    await open(page)
    const volume = page.getByRole('region', { name: 'Orders placed per week' })
    await expect(volume.locator('.recharts-bar-rectangle').first()).toBeVisible()
    await volume.getByRole('button', { name: 'Table' }).click()
    await expect(volume.getByRole('row')).toHaveCount(base.weeks + 1)
  })
})

test.describe('Requirement 2: how long each stage takes, and how it differs by product', () => {
  test('every stage is compared with its target, per product and combined', async ({ page }) => {
    await open(page, '#/turnaround')
    const card = page.getByRole('region', { name: 'Stage turnaround' })
    await expect(card.getByRole('heading', { level: 3 })).toHaveCount(8)
    for (const target of ['Target 3 d', 'Target 7 d', 'Target 45 d', 'Target 14 d', 'Target 28 d', 'Target 5 d']) {
      await expect(card.getByText(target).first()).toBeVisible()
    }
    await expect(card.getByText('WGS 30x', { exact: true })).toHaveCount(8)
    await expect(card.getByText('WGS 100x', { exact: true })).toHaveCount(8)
    const d2m = base.turnaround.find((s) => s.key === 'deliver_to_mail')!
    await expect(card).toContainText(`SLA ${Math.round(d2m.slaPct! * 100)}%`)

    await card.getByRole('button', { name: 'Combined' }).click()
    await expect(card.getByText('WGS 30x', { exact: true })).toHaveCount(0)
    await expect(card.getByText('All', { exact: true })).toHaveCount(8)
  })

  test('explains when only kit-less orders are in view', async ({ page }) => {
    await open(page, '#/turnaround?product=upload_only')
    await expect(page.getByText(/No kit orders match the current filters/)).toBeVisible()
  })
})

test.describe('Requirement 3: find kits that are stuck and need follow-up', () => {
  test('a stage on the overview opens its follow-up queue, narrowed by customer age band', async ({ page }) => {
    await open(page)
    const wc = base.stages.find((s) => s.stage === 'with_customer')!
    await page.getByRole('link', { name: /^With customer: / }).click()
    await expect(page).toHaveURL(/#\/follow-up\?.*stage=with_customer/)
    await expect(heading1(page)).toHaveText(`${n(wc.overdue + wc.atRisk)} orders need follow-up`)

    const over90 = base.overdue.filter((i) => i.ageBand === '90+').length
    await page.getByRole('button', { name: /^With customer 90\+ d/ }).click()
    await expect(heading1(page)).toHaveText(`${n(over90)} orders need follow-up`)
  })

  test('owner queues, paging and CSV export', async ({ page }) => {
    await open(page, '#/follow-up')
    const total = base.overdue.length
    await expect(heading1(page)).toHaveText(`${n(total)} orders need follow-up`)
    await expect(page.getByText(`1–50 of ${n(total)}`)).toBeVisible()
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText(`51–100 of ${n(total)}`)).toBeVisible()

    const lab = base.overdue.filter((i) => i.owner === 'lab').length
    await page.getByRole('button', { name: new RegExp(`^Lab ${lab}$`) }).click()
    await expect(heading1(page)).toHaveText(`${n(lab)} orders need follow-up`)
    // Customer age bands don't apply to the lab queue.
    await expect(page.getByRole('button', { name: /^With customer 90\+/ })).toHaveCount(0)

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
    const lines = readFileSync(await download.path(), 'utf8').trim().split(/\r\n/)
    expect(lines[0]).toMatch(/^order_id,kit_id,product,country,stage/)
    expect(lines).toHaveLength(lab + 1)
    for (const line of lines.slice(1)) expect(line).toContain(',Lab,')
  })
})

test.describe('Requirement 4: drill into a single order', () => {
  test('search by order ID shows every kit, scan and what it is waiting for', async ({ page }) => {
    await open(page)
    const search = page.getByLabel('Search by order, kit or customer ID')
    await search.fill('ord_jthmw')
    await search.press('Enter')
    await expect(page).toHaveURL(/#\/orders\/ord_jthmw/)
    await expect(heading1(page)).toHaveText('ord_jthmw')
    await expect(page.getByRole('heading', { level: 3, name: /^Kit kit_/ })).toHaveCount(3)
    await expect(page.getByText('Waiting for: replacement kit shipped')).toBeVisible()
    await expect(page.getByText('no timezone in the file: read as UTC')).toBeVisible()
    await page.getByText(/^Raw events/).click()
    await expect(page.locator('details table tbody tr')).toHaveCount(10)
  })

  test('search by kit ID and by customer ID', async ({ page }) => {
    await open(page)
    const search = page.getByLabel('Search by order, kit or customer ID')
    await search.fill('kit_pa5rqg')
    await search.press('Enter')
    await expect(heading1(page)).toHaveText('ord_3bilg')
    await expect(page.getByText(/^No scan recorded/)).toBeVisible()

    await search.fill(sample.byOrderId.get('ord_jthmw')!.order.customerId)
    await search.press('Enter')
    await expect(heading1(page)).toHaveText('ord_jthmw')
  })

  test('IDs that only exist in the events file explain why they are excluded', async ({ page }) => {
    await open(page)
    const search = page.getByLabel('Search by order, kit or customer ID')
    await search.fill('ord_sgosv')
    await search.press('Enter')
    await expect(page).toHaveURL(/#\/orders\?q=ord_sgosv/)
    await expect(page.getByText(/reference an order\s+that isn’t in the orders file/)).toBeVisible()
    await open(page, '#/orders/ord_sgosv')
    await expect(page.getByText(/This ID isn’t in the orders file/)).toBeVisible()
  })

  test('the order list filters by ID and opens an order', async ({ page }) => {
    await open(page, '#/orders')
    await page.getByLabel('Filter orders by ID').fill('ord_jth')
    await page.getByLabel('Filter orders by ID').press('Enter')
    await page.getByRole('link', { name: /^ord_jthmw/ }).click()
    await expect(heading1(page)).toHaveText('ord_jthmw')
  })
})

test.describe('Requirement 5: narrow things down by date, product or country', () => {
  test('product and country filters apply to every view and survive a reload', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: /^Product/ }).click()
    await page.getByRole('checkbox', { name: /^WGS 100x/ }).check()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page).toHaveURL(/product=wgs_100x/)
    await expect(kpiValue(page, 'Orders')).toHaveText(n(rawOrderCount({ products: ['wgs_100x'] })))

    await page.getByRole('button', { name: /^Country/ }).click()
    await page.getByRole('checkbox', { name: /^Canada/ }).check()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page).toHaveURL(/country=CA/)
    await expect(kpiValue(page, 'Orders')).toHaveText(n(rawOrderCount({ products: ['wgs_100x'], countries: ['CA'] })))

    await page.getByRole('link', { name: 'Turnaround', exact: true }).click()
    await expect(page).toHaveURL(/#\/turnaround\?.*product=wgs_100x/)
    await expect(page.getByRole('region', { name: 'Stage turnaround' }).getByText('WGS 30x', { exact: true })).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('button', { name: /^Product: WGS 100x/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Country: Canada/ })).toBeVisible()

    await page.getByRole('button', { name: 'Reset filters' }).click()
    await expect(page).not.toHaveURL(/product=|country=/)
  })

  test('order-date presets, test orders and status', async ({ page }) => {
    await open(page)
    const asOfDay = utcDay(sample.maxTimestamp)
    await page.getByRole('button', { name: /^Order date/ }).click()
    await page.getByRole('button', { name: 'Last 30 days' }).click()
    const from = addDays(asOfDay, -29)
    await expect(page).toHaveURL(new RegExp(`from=${from}&to=${asOfDay}`))
    await expect(kpiValue(page, 'Orders')).toHaveText(n(rawOrderCount({ from, to: asOfDay })))

    await page.getByRole('button', { name: 'Reset filters' }).click()
    await page.getByRole('button', { name: 'Test orders' }).click()
    await expect(page).toHaveURL(/test=1/)
    await expect(kpiValue(page, 'Orders')).toHaveText(n(rawOrderCount({ includeTest: true })))

    await page.getByRole('button', { name: /^Status/ }).click()
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page).toHaveURL(/status=all/)
    await expect(kpiValue(page, 'Orders')).toHaveText(n(rawOrderCount({ includeTest: true, statuses: null })))
  })

  test('viewing the data as of an earlier date', async ({ page }) => {
    await open(page, '#/data')
    await page.getByLabel('View as of').fill('2026-09-30')
    await expect(page.getByText(/Viewing as of/)).toBeVisible()
    await page.getByRole('link', { name: 'Overview', exact: true }).click()
    await expect(kpiValue(page, 'Orders')).toHaveText(n(expectedView(sample, {}, dayEnd('2026-09-30')).kpis.orders))
    await page.getByRole('button', { name: 'Back to latest' }).click()
    await expect(kpiValue(page, 'Orders')).toHaveText(n(base.kpis.orders))
  })
})

test.describe('Navigation', () => {
  test('tabs, browser back/forward and unknown routes', async ({ page }) => {
    await open(page)
    await page.getByRole('link', { name: 'Follow-up', exact: true }).click()
    await expect(page).toHaveURL(/#\/follow-up/)
    await page.getByRole('link', { name: 'Orders', exact: true }).click()
    await expect(page).toHaveURL(/#\/orders$/)
    await page.goBack()
    await expect(heading1(page)).toContainText('orders need follow-up')
    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Select an order' })).toBeVisible()
    await open(page, '#/nowhere')
    await expect(page.getByText('Page not found')).toBeVisible()
  })
})
