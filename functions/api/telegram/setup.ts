import { appUrl, json, type Handler } from '../../_lib/env'
import { tgApi } from '../../_lib/telegram'

/**
 * Одноразове налаштування бота: вебхук, кнопка меню і команди.
 * Відкрийте у браузері: https://<ваш-сайт>/api/telegram/setup?secret=<TELEGRAM_WEBHOOK_SECRET>
 */
export const onRequestGet: Handler = async ({ request, env }) => {
  const url = new URL(request.url)
  if (!env.TELEGRAM_WEBHOOK_SECRET || url.searchParams.get('secret') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ error: 'forbidden' }, 403)
  }
  const base = appUrl(env, request)
  const token = env.TELEGRAM_BOT_TOKEN
  const webhook = await tgApi(token, 'setWebhook', {
    url: `${url.origin}/api/telegram/webhook`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
  })
  const menu = await tgApi(token, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Меню', web_app: { url: base } },
  })
  const commands = await tgApi(token, 'setMyCommands', {
    commands: [
      { command: 'menu', description: 'Відкрити меню' },
      { command: 'kitchen', description: 'Кабінет кухаря' },
    ],
  })
  const me = await tgApi(token, 'getMe', {})
  return json({ app_url: base, webhook, menu, commands, bot: me.result })
}
