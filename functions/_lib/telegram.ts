const enc = new TextEncoder()

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

const MAX_AGE_SECONDS = 24 * 60 * 60

/** Перевірка підпису initData з Telegram Mini App. */
export async function verifyInitData(initData: string, botToken: string): Promise<TelegramUser | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = await hmac(enc.encode('WebAppData'), botToken)
  if (!safeEqual(hex(await hmac(secret, check)), hash)) return null
  if (Date.now() / 1000 - Number(params.get('auth_date')) > MAX_AGE_SECONDS) return null
  try {
    return JSON.parse(params.get('user') ?? 'null') as TelegramUser | null
  } catch {
    return null
  }
}

/** Перевірка даних з Telegram Login Widget (вхід на сайті поза Telegram). */
export async function verifyLoginWidget(data: Record<string, string | number>, botToken: string): Promise<TelegramUser | null> {
  const { hash, ...rest } = data
  if (!hash) return null
  const check = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n')
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(botToken))
  if (!safeEqual(hex(await hmac(secret, check)), String(hash))) return null
  if (Date.now() / 1000 - Number(rest.auth_date) > MAX_AGE_SECONDS) return null
  return {
    id: Number(rest.id),
    first_name: rest.first_name as string | undefined,
    last_name: rest.last_name as string | undefined,
    username: rest.username as string | undefined,
  }
}

export async function tgApi(botToken: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; description?: string; result?: unknown }
}

/** Надсилає повідомлення. Помилки (користувач не запускав бота тощо) не зупиняють роботу. */
export async function sendMessage(botToken: string, chatId: number, text: string, button?: { text: string; url: string }) {
  return tgApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, web_app: { url: button.url } }]] } } : {}),
  })
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
