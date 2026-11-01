import { adminClient, adminTelegramIds, anonClient, json, type Handler } from '../../_lib/env'
import { verifyInitData, verifyLoginWidget, type TelegramUser } from '../../_lib/telegram'

/**
 * Вхід через Telegram: перевіряє підпис Telegram і видає сесію Supabase.
 * Для кожного Telegram-користувача створюється акаунт Supabase з технічною поштою;
 * пароль щоразу генерується випадково, тож увійти можна лише через Telegram.
 */
export const onRequestPost: Handler = async ({ request, env }) => {
  const body = (await request.json().catch(() => ({}))) as { initData?: string; widget?: Record<string, string | number> }

  let tgUser: TelegramUser | null = null
  if (body.initData) tgUser = await verifyInitData(body.initData, env.TELEGRAM_BOT_TOKEN)
  else if (body.widget) tgUser = await verifyLoginWidget(body.widget, env.TELEGRAM_BOT_TOKEN)
  if (!tgUser?.id) return json({ error: 'Неправильний або застарілий підпис Telegram' }, 401)

  const db = adminClient(env)
  const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ')
  const password = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const metadata = { telegram_id: tgUser.id, full_name: fullName, telegram_username: tgUser.username ?? null }

  const { data: existing } = await db.from('profiles').select('id, full_name').eq('telegram_id', tgUser.id).maybeSingle()
  let userId = existing?.id as string | undefined
  let email: string

  if (userId) {
    const { data, error } = await db.auth.admin.updateUserById(userId, { password, user_metadata: metadata })
    if (error || !data.user?.email) return json({ error: error?.message ?? 'Користувача не знайдено' }, 500)
    email = data.user.email
  } else {
    email = `tg${tgUser.id}@telegram.stolovka.app`
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata })
    if (error || !data.user) return json({ error: error?.message ?? 'Не вдалося створити акаунт' }, 500)
    userId = data.user.id
  }

  const isAdmin = adminTelegramIds(env).includes(tgUser.id)
  const { error: profileError } = await db
    .from('profiles')
    .update({
      telegram_id: tgUser.id,
      telegram_username: tgUser.username ?? null,
      ...(existing?.full_name ? {} : { full_name: fullName }),
      ...(isAdmin ? { role: 'admin' } : {}),
    })
    .eq('id', userId)
  if (profileError) return json({ error: profileError.message }, 500)

  const { data: signIn, error: signInError } = await anonClient(env).auth.signInWithPassword({ email, password })
  if (signInError || !signIn.session) return json({ error: signInError?.message ?? 'Не вдалося увійти' }, 500)

  return json({ access_token: signIn.session.access_token, refresh_token: signIn.session.refresh_token })
}
