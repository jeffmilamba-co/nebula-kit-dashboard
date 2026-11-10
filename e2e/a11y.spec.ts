// Automated WCAG 2.1 A/AA checks (axe-core) on every page, desktop and phone.
// Automated checks catch roughly a third of accessibility issues; the rest (keyboard paths,
// focus order, wording) are covered by the role-based selectors used throughout these tests.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, open, test } from './helpers.ts'

const PAGES = [
  ['overview', '#/'],
  ['turnaround', '#/turnaround'],
  ['follow-up', '#/follow-up'],
  ['orders', '#/orders'],
  ['order detail', '#/orders/ord_jthmw'],
  ['data', '#/data'],
] as const

for (const [name, hash] of PAGES) {
  test(`${name} has no WCAG A/AA violations @a11y`, async ({ page }) => {
    await open(page, hash)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`)
    expect(summary, summary.join('\n')).toEqual([])
  })
}
