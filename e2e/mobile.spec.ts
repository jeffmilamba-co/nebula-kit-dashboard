import { expect, heading1, open, test } from './helpers.ts'

test('@mobile every page fits a phone screen without sideways scrolling', async ({ page }) => {
  for (const hash of ['#/', '#/turnaround', '#/follow-up', '#/orders', '#/orders/ord_jthmw', '#/data']) {
    await open(page, hash)
    await expect(page.locator('main')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `horizontal overflow on ${hash}`).toBeLessThanOrEqual(0)
  }
})

test('@mobile an order opens full-screen with a way back to the list', async ({ page }) => {
  await open(page, '#/orders/ord_jthmw')
  await expect(heading1(page)).toHaveText('ord_jthmw')
  await expect(page.getByLabel('Filter orders by ID')).toBeHidden()
  await page.getByRole('link', { name: 'Back to orders' }).click()
  await expect(page.getByLabel('Filter orders by ID')).toBeVisible()
})
