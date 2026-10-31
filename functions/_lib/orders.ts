import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeHtml } from './telegram'

export const STATUS_LABELS: Record<string, string> = {
  new: 'нове',
  accepted: 'прийнято',
  cooking: 'готується',
  ready: 'готове',
  delivered: 'видано',
  cancelled: 'скасовано',
}

export interface OrderRow {
  id: string
  number: number
  customer_id: string
  chef_id: string
  apartment: string
  customer_name: string
  phone: string | null
  comment: string | null
  delivery_date: string
  slot: string
  fulfillment: string
  status: string
  total_cents: number
  notified_at: string | null
  desired_time?: string | null
  order_items: { dish_name: string; qty: number; price_cents: number }[]
  chefs: { display_name: string } | null
}

interface SlotCfg {
  label: string
  window_start: string
  window_end: string
}

export async function loadSlots(db: SupabaseClient): Promise<Record<string, SlotCfg>> {
  const { data } = await db.from('settings').select('slots').eq('id', 1).maybeSingle()
  return (data?.slots ?? {}) as Record<string, SlotCfg>
}

const money = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`

export function whenText(order: OrderRow, slots: Record<string, SlotCfg>) {
  const s = slots[order.slot]
  const [, m, d] = order.delivery_date.split('-')
  if (order.slot === 'custom') return `Під замовлення, ${d}.${m}${order.desired_time ? `, на ${order.desired_time}` : ', час узгодити'}`
  return `${s?.label ?? order.slot}, ${d}.${m}${s ? ` (${s.window_start}–${s.window_end})` : ''}`
}

/** Текст нового замовлення для кухаря. */
export function newOrderText(order: OrderRow, slots: Record<string, SlotCfg>, forAdmin = false) {
  const lines = [
    `🆕 <b>Замовлення №${order.number}</b>${forAdmin && order.chefs ? ` для ${escapeHtml(order.chefs.display_name)}` : ''}`,
    `🕐 ${whenText(order, slots)}`,
    `🏠 ${order.fulfillment === 'pickup' ? 'самовивіз' : `кв. ${escapeHtml(order.apartment)}`} · ${escapeHtml(order.customer_name)}${order.phone ? ` · ${escapeHtml(order.phone)}` : ''}`,
    '',
    ...order.order_items.map((i) => `• ${escapeHtml(i.dish_name)} × ${i.qty} — ${money(i.price_cents * i.qty)}`),
    '',
    `💶 Разом: <b>${money(order.total_cents)}</b> (готівка)`,
  ]
  if (order.comment) lines.push(`💬 ${escapeHtml(order.comment)}`)
  return lines.join('\n')
}

export const ORDER_SELECT = '*, order_items(dish_name, qty, price_cents), chefs(display_name)'
