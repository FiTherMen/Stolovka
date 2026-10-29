import { adminClient, appUrl, json, type Handler } from '../../_lib/env'
import { sendMessage } from '../../_lib/telegram'

interface Update {
  message?: { chat: { id: number; type: string }; from?: { id: number; first_name?: string }; text?: string }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Вебхук бота: /start відкриває меню, /start chef_<токен> підключає сповіщення кухаря. */
export const onRequestPost: Handler = async ({ request, env }) => {
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ error: 'forbidden' }, 403)
  }
  const update = (await request.json().catch(() => ({}))) as Update
  const msg = update.message
  if (!msg?.text || msg.chat.type !== 'private') return json({ ok: true })

  const base = appUrl(env, request)
  const [command, payload] = msg.text.trim().split(/\s+/, 2)

  if (command === '/start' && payload?.startsWith('chef_')) {
    const token = payload.slice(5)
    if (UUID.test(token)) {
      const db = adminClient(env)
      const { data } = await db
        .from('chef_telegram')
        .update({ chat_id: msg.chat.id, linked_at: new Date().toISOString() })
        .eq('link_token', token)
        .select('chef_id')
      if (data?.length) {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, msg.chat.id, '✅ Готово! Тепер нові замовлення на ваші страви приходитимуть сюди.', {
          text: 'Відкрити кухню',
          url: `${base}/kitchen`,
        })
        return json({ ok: true })
      }
    }
    await sendMessage(env.TELEGRAM_BOT_TOKEN, msg.chat.id, 'Посилання застаріло. Відкрийте кабінет кухаря і натисніть «Підключити Telegram» ще раз.')
    return json({ ok: true })
  }

  if (command === '/start' || command === '/menu') {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      msg.chat.id,
      `Привіт${msg.from?.first_name ? `, ${msg.from.first_name}` : ''}! 🥣\nТут можна замовити домашню їжу від кухарів нашого будинку: сніданок, обід або вечерю з доставкою до дверей. Оплата готівкою при отриманні.`,
      { text: '🍽️ Відкрити меню', url: base },
    )
    return json({ ok: true })
  }

  if (command === '/kitchen') {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, msg.chat.id, 'Кабінет кухаря: страви, замовлення і відгуки.', { text: '👩‍🍳 Кухня', url: `${base}/kitchen` })
    return json({ ok: true })
  }

  await sendMessage(env.TELEGRAM_BOT_TOKEN, msg.chat.id, 'Натисніть кнопку, щоб відкрити меню.', { text: '🍽️ Відкрити меню', url: base })
  return json({ ok: true })
}
