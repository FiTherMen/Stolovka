import type { Settings, Slot } from '../types'

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
