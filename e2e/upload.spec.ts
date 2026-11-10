// Requirement 6: load a different pair of CSVs with the same columns.
import { loadDataset } from '../src/data/pipeline.ts'
import { expect, expectedView, heading1, kpiValue, n, open, sample, test } from './helpers.ts'

// A deliberately messy export: BOM, CRLF, upper-case headers, an extra column, odd enum casing.
const ORDERS =
  '﻿' +
  [
    'ORDER_ID,Created_At,Customer_ID,Product,Country,Status,Is_Test,Notes',
    'e2e_o1,2026-03-01T10:00:00-05:00,c1,wgs_30x,US,paid,false,finished; sample_mailed scan missing',
    'e2e_o2,2026-03-02T09:00:00+01:00,c2,WGS_100X,gb, Paid ,FALSE,customer never mailed the sample',
    'e2e_o3,2026-03-03T12:00:00Z,c3,wgs_30x,CA,paid,0,"four kits, still going"',
    'e2e_o4,2026-04-01T12:00:00Z,c4,wgs_100x,US,paid,no,QC failed and no replacement logged',
    'e2e_o5,2026-04-02T12:00:00Z,c5,wgs_30x,US,refunded,false,refunded while in transit',
    'e2e_o6,2026-04-03T12:00:00Z,c6,upload_only,DE,paid,false,',
    'e2e_o7,2026-04-04T12:00:00Z,c7,wgs_30x,US,paid,TRUE,test order',
    'e2e_o8,2026-05-25T12:00:00Z,c8,wgs_30x,AU,paid,false,never shipped',
  ].join('\r\n') +
  '\r\n'

const ev = (id: string, order: string, kit: string, type: string, at: string, source = 'system') =>
  [id, order, kit, type, at, source].join(',')

// Mixed timestamp formats, two duplicates, an orphan (which also carries the latest timestamp)
// and an unknown event type.
const EVENTS = [
  'event_id,order_id,kit_id,event_type,occurred_at,source',
  ev('e01', 'e2e_o1', 'k1', 'kit_shipped', '2026-03-02T12:00:00Z'),
  ev('e02', 'e2e_o1', 'k1', 'kit_shipped', '2026-03-02T12:00:00Z'),
  ev('e03', 'e2e_o1', 'k1', 'kit_delivered', '2026-03-05T10:00:00-04:00', 'carrier'),
  ev('e04', 'e2e_o1', 'k1', 'kit_delivered', '2026-03-05 14:00:00', 'carrier'),
  ev('e05', 'e2e_o1', 'k1', 'sample_received', '2026-03-15 09:00:00', 'lab'),
  ev('e06', 'e2e_o1', 'k1', 'qc_passed', '2026-03-17T09:00:00Z', 'lab'),
  ev('e07', 'e2e_o1', 'k1', 'sequencing_complete', '2026-04-05T09:00:00Z', 'lab'),
  ev('e08', 'e2e_o1', 'k1', 'report_ready', '2026-04-07T09:00:00Z'),
  ev('e09', 'e2e_o2', 'k2', 'kit_shipped', '2026-03-03T12:00:00Z'),
  ev('e10', 'e2e_o2', 'k2', 'kit_delivered', '2026-03-07T12:00:00Z', 'carrier'),
  ev('e11', 'e2e_o2', 'k2', 'teleported', '2026-03-10T12:00:00Z'),
  ev('e12', 'e2e_o3', 'kA', 'kit_shipped', '2026-03-04T12:00:00Z'),
  ev('e13', 'e2e_o3', 'kA', 'kit_replaced', '2026-03-19T12:00:00Z'),
  ev('e14', 'e2e_o3', 'kB', 'kit_shipped', '2026-03-21T12:00:00Z'),
  ev('e15', 'e2e_o3', 'kB', 'kit_delivered', '2026-03-25T12:00:00Z', 'carrier'),
  ev('e16', 'e2e_o3', 'kB', 'sample_mailed', '2026-04-01T12:00:00Z', 'carrier'),
  ev('e17', 'e2e_o3', 'kB', 'kit_replaced', '2026-04-26T12:00:00Z'),
  ev('e18', 'e2e_o3', 'kC', 'kit_shipped', '2026-04-28T12:00:00Z'),
  ev('e19', 'e2e_o3', 'kC', 'kit_delivered', '2026-05-01T12:00:00Z', 'carrier'),
  ev('e20', 'e2e_o3', 'kC', 'sample_mailed', '2026-05-03T12:00:00Z', 'carrier'),
  ev('e21', 'e2e_o3', 'kC', 'sample_received', '2026-05-08T12:00:00Z', 'lab'),
  ev('e22', 'e2e_o3', 'kC', 'qc_failed', '2026-05-10T12:00:00Z', 'lab'),
  ev('e23', 'e2e_o3', 'kC', 'kit_replaced', '2026-05-11T12:00:00Z'),
  ev('e24', 'e2e_o3', 'kD', 'kit_shipped', '2026-05-13T12:00:00Z'),
  ev('e25', 'e2e_o3', 'kD', 'kit_delivered', '2026-05-16T12:00:00Z', 'carrier'),
  ev('e26', 'e2e_o4', 'k4', 'kit_shipped', '2026-04-02T12:00:00Z'),
  ev('e27', 'e2e_o4', 'k4', 'kit_delivered', '2026-04-05T12:00:00Z', 'carrier'),
  ev('e28', 'e2e_o4', 'k4', 'sample_mailed', '2026-04-10T12:00:00Z', 'carrier'),
  ev('e29', 'e2e_o4', 'k4', 'sample_received', '2026-04-15T12:00:00Z', 'lab'),
  ev('e30', 'e2e_o4', 'k4', 'qc_failed', '2026-05-20T12:00:00Z', 'lab'),
  ev('e31', 'e2e_o5', 'k5', 'kit_shipped', '2026-04-03T12:00:00Z'),
  ev('e32', 'e2e_o7', 'k7', 'kit_shipped', '2026-04-05T12:00:00Z'),
  ev('e33', 'e2e_o7', 'k7', 'kit_delivered', '2026-04-08T12:00:00Z', 'carrier'),
  ev('e34', 'e2e_ghost', 'k9', 'qc_passed', '2026-06-01T12:00:00Z', 'carrier'),
].join('\n')

const file = (name: string, text: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') })
const uploaded = loadDataset({ name: 'e2e-orders.csv', text: ORDERS }, { name: 'e2e-events.csv', text: EVENTS })
const expected = expectedView(uploaded)

test.describe('Requirement 6: load a different pair of CSVs', () => {
  test('a messy export replaces the sample and flows through every view', async ({ page }) => {
    await open(page, '#/data')
    // Events first: files are recognised by their headers, not their order.
    await page.locator('input[type=file]').setInputFiles([file('e2e-events.csv', EVENTS), file('e2e-orders.csv', ORDERS)])
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByRole('region', { name: 'Dataset' })).toContainText('Your files · e2e-orders.csv + e2e-events.csv')

    // Hand-checked facts about the fixture, plus the data layer's full answer.
    expect(expected.kpis).toMatchObject({ orders: 6, kitOrders: 5, noKitOrders: 1, finished: 1, overdue: 3 })
    await expect(kpiValue(page, 'Orders')).toHaveText(n(expected.kpis.orders))
    await expect(kpiValue(page, 'Reports ready')).toHaveText(n(expected.kpis.finished))
    await expect(kpiValue(page, 'In the pipeline')).toHaveText(n(expected.kpis.inPipeline))
    await expect(page.getByRole('region', { name: 'Pipeline at a glance' })).toContainText('Not shown: 1 refunded · 1 test orders')

    await page.getByRole('link', { name: 'Follow-up', exact: true }).click()
    await expect(heading1(page)).toHaveText('3 orders need follow-up')
    await expect(page.getByRole('link', { name: 'e2e_o4' })).toBeVisible() // QC failed, no replacement logged
    await expect(page.getByText('QC failed with no replacement logged: issue and ship a replacement kit')).toBeVisible()

    const search = page.getByLabel('Search by order, kit or customer ID')
    await search.fill('e2e_o3')
    await search.press('Enter')
    await expect(page.getByText('4 kits', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: /^Kit k[A-D]$/ })).toHaveCount(4)

    await page.getByRole('link', { name: 'Data', exact: true }).click()
    const checks = page.getByRole('region', { name: 'Data checks' })
    const found = (label: string) => checks.getByRole('row', { name: new RegExp(`^${label}`) }).locator('td').nth(1)
    await expect(found('Duplicate events merged')).toHaveText('2')
    await expect(found('Events for orders not in the orders file')).toHaveText('1')
    await expect(found('Timestamps without a timezone')).toHaveText('2')
    await expect(found('Kits with a skipped scan')).toHaveText('1')
    await expect(found('Unknown event types')).toHaveText('1')
    await expect(found('Test orders')).toHaveText('1')
    // The orphan carries the latest timestamp, and "now" is taken from the files, not the clock.
    await expect(page.getByText('Data as of', { exact: false }).first()).toContainText('Jun 1, 2026, 12:00 UTC')
  })

  test('bad uploads are explained and the current data stays loaded', async ({ page }) => {
    await open(page, '#/data')
    const input = page.locator('input[type=file]')
    const alert = page.getByRole('alert')

    await input.setInputFiles([file('a.csv', ORDERS), file('b.csv', ORDERS)])
    await expect(alert).toContainText('Both files look like orders files')

    const noOccurredAt = EVENTS.replace('occurred_at', 'when')
    await input.setInputFiles([file('orders.csv', ORDERS), file('events.csv', noOccurredAt)])
    await expect(alert).toContainText('events.csv: missing required column occurred_at')

    await input.setInputFiles([file('orders.csv', ORDERS)])
    await expect(alert).toContainText('Please choose two files')

    // Still the sample data.
    await expect(page.getByRole('region', { name: 'Data checks' })).toContainText(
      `${n(sample.quality.orderRows)} order rows and ${n(sample.quality.eventRows)} event rows`,
    )
  })

  test('the sample can be restored after an upload', async ({ page }) => {
    await open(page, '#/data')
    await page.locator('input[type=file]').setInputFiles([file('o.csv', ORDERS), file('e.csv', EVENTS)])
    await expect(kpiValue(page, 'Orders')).toHaveText(n(expected.kpis.orders))
    await page.getByRole('region', { name: 'Dataset' }).getByRole('button', { name: 'Restore sample data' }).click()
    await expect(kpiValue(page, 'Orders')).toHaveText(n(expectedView(sample).kpis.orders))
  })
})
