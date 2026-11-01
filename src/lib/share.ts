import { isDemo } from './demo'
import { botUsername, inTelegram, tg } from './telegram'

/** Адреса сторінки кухаря на сайті (з гарним превʼю в Telegram/WhatsApp). */
export function chefUrl(slug: string): string {
  const origin = isDemo ? 'https://stolovka.price.biz.ua' : window.location.origin
  return `${origin}/chef/${slug}`
}

/** Посилання, що відкриває сторінку кухаря одразу в Mini App (потрібен Main Mini App у BotFather). */
export function chefTelegramLink(slug: string): string | null {
  return botUsername ? `https://t.me/${botUsername}?startapp=chef_${slug}` : null
}

/** Slug з параметра startapp: chef_kukhnia-oksany → kukhnia-oksany. */
export function slugFromStartParam(param: string | undefined): string | null {
  if (!param?.startsWith('chef_')) return null
  return param.slice(5) || null
}

/** Поділитися: у Telegram — вікно вибору чату, на телефоні — системне меню, інакше копіює. Повертає 'copied', якщо скопійовано. */
export async function shareLink(url: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (inTelegram && tg) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
    return 'shared'
  }
  if (navigator.share) {
    try {
      await navigator.share({ url, text })
      return 'shared'
    } catch {
      /* скасовано або недоступно: копіюємо */
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const UA: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu',
  я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '', "'": '', 'ʼ': '', '’': '',
}

/** «Кухня Оксани» → «kukhnia-oksany». */
export function slugify(name: string): string {
  return [...name.toLowerCase()]
    .map((ch) => UA[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/
