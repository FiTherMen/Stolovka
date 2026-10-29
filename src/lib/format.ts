import type { OrderStatus } from '../types'

export const money = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Нове',
  accepted: 'Прийнято',
  cooking: 'Готується',
  ready: 'Готово',
  delivered: 'Видано',
  cancelled: 'Скасовано',
}

/** Наступний статус для кнопки на кухні. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  new: 'accepted',
  accepted: 'cooking',
  cooking: 'ready',
  ready: 'delivered',
}

export function stars(rating: number) {
  const r = Math.round(rating)
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

