import type { Health } from '../data/types.ts'

/**
 * Categorical series colors, in fixed order (color follows the entity, never its rank).
 * Slot 1 is LinkedIn blue. Validated with the dataviz palette checker on the white card
 * surface: worst adjacent CVD ΔE 9.2, normal-vision ΔE 27.6. Slot 3 is below 3:1 contrast,
 * so charts using it also offer a table view.
 */
export const SERIES = ['#0a66c2', '#eb6834', '#1baf7a']
export const SERIES_OTHER = '#a8a6a0'

/** Products keep their color whatever the filters show: index in the dataset's product list. */
export function productColor(product: string, products: string[]): string {
  const i = products.indexOf(product)
  return i >= 0 && i < SERIES.length ? SERIES[i] : SERIES_OTHER
}

export const HEALTH_COLOR: Record<Health, string> = {
  on_track: '#6da7ec',
  at_risk: '#fab219',
  overdue: '#cc1016',
  closed: '#c3c2b7',
}

export const HEALTH_LABEL: Record<Health, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  overdue: 'Overdue',
  closed: 'Closed (not paid)',
}
