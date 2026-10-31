import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeHtml, sendMessage } from './telegram'

interface SlotCfg {
  label: string
  window_start: string
  window_end: string
  cutoff_time: string
  cutoff_days_before: number
}

interface PrepOrder {
  number: number
  chef_id: string
  apartment: string
  customer_name: string
  comment: string | null
  slot: string
  status: string
  fulfillment: string
  order_items: { dish_id: string | null; dish_name: string; qty: number; unit: string | null }[]
}

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner']
const unitShort = (u: string | null) => (u === 'piece' ? 'шт' : 'порц.')

/** Дата 'YYYY-MM-DD' + n днів. */
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function todayIn(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function dayTitle(date: string) {
  return new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

/** Текст «Що готувати» для одного кухаря на дату. */
export function prepText(date: string, orders: PrepOrder[], slots: Record<string, SlotCfg>) {
  const totals = new Map<string, { name: string; unit: string | null; qty: number }>()
  orders.forEach((o) =>
    o.order_items.forEach((i) => {
      const key = i.dish_id ?? i.dish_name
      const t = totals.get(key) ?? { name: i.dish_name, unit: i.unit, qty: 0 }
      t.qty += i.qty
      totals.set(key, t)
    }),
  )
  const sorted = [...totals.values()].sort((a, b) => (a.unit === b.unit ? b.qty - a.qty : a.unit === 'piece' ? -1 : 1))
  const lines = [`🍯 <b>Що готувати · ${dayTitle(date)}</b>`, '', '<b>Разом:</b>']
  sorted.forEach((t) => lines.push(`• ${escapeHtml(t.name)} — <b>${t.qty} ${unitShort(t.unit)}</b>`))

  for (const slot of SLOT_ORDER) {
    const list = orders.filter((o) => o.slot === slot)
    if (!list.length) continue
    const s = slots[slot]
    lines.push('', `<b>${escapeHtml(s?.label ?? slot)}${s ? ` ${s.window_start}–${s.window_end}` : ''}:</b>`)
    list.forEach((o) => {
      const where = o.fulfillment === 'pickup' ? 'самовивіз' : `кв. ${escapeHtml(o.apartment)}`
      const what = o.order_items.map((i) => `${escapeHtml(i.dish_name)} ${i.qty}${i.unit === 'piece' ? ' шт' : ''}`).join(', ')
      lines.push(`🏠 ${where}: ${what}${o.comment ? `\n   💬 ${escapeHtml(o.comment)}` : ''}`)
    })
  }

  const notAccepted = orders.filter((o) => o.status === 'new').length
  if (notAccepted) lines.push('', `⚠️ Ще не прийнято: ${notAccepted}. Прийміть їх у кухні.`)
  const stillOpen = SLOT_ORDER.filter((k) => slots[k] && !slots[k].cutoff_days_before)
  if (stillOpen.length) {
    lines.push('', `Список може доповнитися: ${stillOpen.map((k) => `${slots[k].label.toLowerCase()} до ${slots[k].cutoff_time}`).join(', ')} того ж дня.`)
  }
  return lines.join('\n')
}

/** Надсилає кожному кухарю з підключеним Telegram список «Що готувати» на дату. Повертає кількість надісланих. */
export async function sendPrepSummaries(db: SupabaseClient, botToken: string, baseUrl: string | null, date?: string) {
  const { data: settings } = await db.from('settings').select('slots, timezone').eq('id', 1).maybeSingle()
  const tz = (settings?.timezone as string) || 'Europe/Madrid'
  const slots = (settings?.slots ?? {}) as Record<string, SlotCfg>
  const day = date ?? addDays(todayIn(tz), 1)

  const { data } = await db
    .from('orders')
    .select('number, chef_id, apartment, customer_name, comment, slot, status, fulfillment, order_items(dish_id, dish_name, qty, unit)')
    .eq('delivery_date', day)
    .neq('status', 'cancelled')
    .order('created_at')
  const orders = (data ?? []) as PrepOrder[]
  if (!orders.length) return { date: day, sent: 0 }

  const chefIds = [...new Set(orders.map((o) => o.chef_id))]
  const { data: chats } = await db.from('chef_telegram').select('chef_id, chat_id').in('chef_id', chefIds)
  let sent = 0
  for (const c of chats ?? []) {
    if (!c.chat_id) continue
    const mine = orders.filter((o) => o.chef_id === c.chef_id)
    const r = await sendMessage(botToken, c.chat_id as number, prepText(day, mine, slots), baseUrl ? { text: 'Що готувати', url: `${baseUrl}/kitchen/prep` } : undefined)
    if (r.ok) sent++
  }
  return { date: day, sent }
}
