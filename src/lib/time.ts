import type { Dish, OrderSlot, Settings, Slot } from '../types'

export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner']

/** Дата 'YYYY-MM-DD' у часовому поясі платформи. */
export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Поточний момент як 'YYYY-MM-DD HH:MM' у часовому поясі платформи (для порівняння рядків). */
export function nowIn(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Дедлайн замовлення як 'YYYY-MM-DD HH:MM' за місцевим часом платформи. */
export function cutoffOf(settings: Settings, date: string, slot: Slot): string {
  const cfg = settings.slots[slot]
  return `${addDays(date, -(cfg.cutoff_days_before || 0))} ${cfg.cutoff_time}`
}

export function isSlotOpen(settings: Settings, date: string, slot: Slot): boolean {
  const cfg = settings.slots[slot]
  return cfg.enabled && nowIn(settings.timezone) < cutoffOf(settings, date, slot)
}

/** Дедлайн для конкретної страви: страви «заздалегідь» треба замовити за N днів до advance_cutoff_time. */
export function dishCutoffOf(settings: Settings, dish: Pick<Dish, 'lead_days'>, date: string, slot: Slot): string {
  const slotCutoff = cutoffOf(settings, date, slot)
  if (!dish.lead_days) return slotCutoff
  const own = `${addDays(date, -dish.lead_days)} ${advanceTime(settings)}`
  return own < slotCutoff ? own : slotCutoff
}

export function isDishOpen(settings: Settings, dish: Pick<Dish, 'lead_days'>, date: string, slot: Slot): boolean {
  return isSlotOpen(settings, date, slot) && nowIn(settings.timezone) < dishCutoffOf(settings, dish, date, slot)
}

export function advanceTime(settings: Settings): string {
  return (settings.advance_cutoff_time ?? '21:00').slice(0, 5)
}

/** «Замовити до 21:00 напередодні» / «… за 2 дні». Порожньо для звичайних страв. */
export function leadLabel(settings: Settings, dish: Pick<Dish, 'lead_days'>): string {
  if (!dish.lead_days) return ''
  const when = dish.lead_days === 1 ? 'напередодні' : `за ${dish.lead_days} ${dish.lead_days < 5 ? 'дні' : 'днів'}`
  return `Під замовлення: до ${advanceTime(settings)} ${when}`
}

export function availableDates(settings: Settings): string[] {
  const today = todayIn(settings.timezone)
  return Array.from({ length: settings.max_days_ahead + 1 }, (_, i) => addDays(today, i))
}

const weekday = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function dateLabel(date: string, tz: string): string {
  const today = todayIn(tz)
  if (date === today) return 'Сьогодні'
  if (date === addDays(today, 1)) return 'Завтра'
  const d = new Date(`${date}T12:00:00Z`)
  return `${weekday.format(d)}, ${dayMonth.format(d)}`
}

/** Людський опис дедлайну: «до 10:00» або «до 21:00 напередодні». */
export function cutoffLabel(settings: Settings, slot: Slot): string {
  const cfg = settings.slots[slot]
  if (cfg.cutoff_days_before === 1) return `до ${cfg.cutoff_time} напередодні`
  if (cfg.cutoff_days_before > 1) return `до ${cfg.cutoff_time} за ${cfg.cutoff_days_before} дні`
  return `до ${cfg.cutoff_time}`
}

export const DEFAULT_SETTINGS: Settings = {
  platform_fee_percent: 10,
  max_days_ahead: 7,
  timezone: 'Europe/Madrid',
  slots: {
    breakfast: { label: 'Сніданок', window_start: '08:30', window_end: '09:00', cutoff_time: '21:00', cutoff_days_before: 1, enabled: true },
    lunch: { label: 'Обід', window_start: '13:30', window_end: '14:00', cutoff_time: '10:00', cutoff_days_before: 0, enabled: true },
    dinner: { label: 'Вечеря', window_start: '20:00', window_end: '20:30', cutoff_time: '16:00', cutoff_days_before: 0, enabled: true },
  },
}

/** Страва «під замовлення»: без сніданку/обіду/вечері, клієнт обирає дату сам. */
export const isCustomDish = (d: Pick<Dish, 'slots'>) => d.slots.includes('custom')
export const CUSTOM_LABEL = 'Під замовлення'
/** До скількох днів наперед можна замовити «під замовлення» (те саме обмеження в базі). */
export const CUSTOM_MAX_DAYS = 60

/** Назва вікна для замовлення, включно з «Під замовлення». */
export function slotTitle(settings: Settings, slot: OrderSlot): string {
  return slot === 'custom' ? CUSTOM_LABEL : settings.slots[slot].label
}

/** Час видачі: «13:30–14:00», бажаний час клієнта або «час узгодить кухар». */
export function slotWindow(settings: Settings, slot: OrderSlot, desired?: string | null): string {
  if (slot === 'custom') return desired ? `на ${desired}` : 'час узгодить кухар'
  return `${settings.slots[slot].window_start}–${settings.slots[slot].window_end}`
}

/** Найраніша дата для страви «під замовлення». */
export function customMinDate(settings: Settings, dish: Pick<Dish, 'lead_days'>): string {
  const today = todayIn(settings.timezone)
  const lead = Math.max(1, dish.lead_days || 1)
  // Після advance_cutoff_time (21:00) сьогоднішній день уже не рахується.
  const late = nowIn(settings.timezone).slice(11) >= advanceTime(settings)
  return addDays(today, lead + (late ? 1 : 0))
}

/** «Під замовлення, від 2 днів». */
export function customLeadLabel(dish: Pick<Dish, 'lead_days'>): string {
  const n = Math.max(1, dish.lead_days || 1)
  return `${CUSTOM_LABEL}, мінімум за ${n} ${n === 1 ? 'день' : n < 5 ? 'дні' : 'днів'}`
}

/** Усі вікна замовлень у порядку показу: сніданок, обід, вечеря, під замовлення. */
export const ORDER_SLOTS: OrderSlot[] = [...SLOTS, 'custom']
