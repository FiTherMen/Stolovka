// Мінімальні типи Telegram WebApp (скрипт підключено в index.html).
interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: { id: number; first_name?: string; last_name?: string; username?: string }; start_param?: string }
  colorScheme: 'light' | 'dark'
  ready(): void
  expand(): void
  close(): void
  openTelegramLink(url: string): void
  HapticFeedback?: { notificationOccurred(type: 'success' | 'error' | 'warning'): void }
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export const tg: TelegramWebApp | undefined = window.Telegram?.WebApp

/** true, коли сторінку відкрито як Mini App всередині Telegram. */
export const inTelegram = Boolean(tg && tg.initData)

export function initTelegram() {
  if (!inTelegram || !tg) return
  tg.ready()
  tg.expand()
  document.documentElement.dataset.tg = '1'
}

export function haptic(type: 'success' | 'error' | 'warning') {
  tg?.HapticFeedback?.notificationOccurred(type)
}

export const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) || ''
