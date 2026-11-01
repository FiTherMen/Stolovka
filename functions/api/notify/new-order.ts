import { adminClient, adminTelegramIds, appUrl, json, userFromRequest, type Handler } from '../../_lib/env'
import { ORDER_SELECT, loadSlots, newOrderText, whenText, type OrderRow } from '../../_lib/orders'
import { sendMessage } from '../../_lib/telegram'

/** Після оформлення: сповіщає кухарів, адміністраторів і клієнта. Кожне замовлення сповіщається один раз. */
export const onRequestPost: Handler = async ({ request, env }) => {
  const user = await userFromRequest(env, request)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const { orderIds } = (await request.json().catch(() => ({}))) as { orderIds?: string[] }
  if (!Array.isArray(orderIds) || orderIds.length === 0) return json({ error: 'orderIds required' }, 400)

  const db = adminClient(env)
  const { data } = await db
    .from('orders')
    .select(ORDER_SELECT)
    .in('id', orderIds.slice(0, 20))
    .eq('customer_id', user.id)
    .is('notified_at', null)
  const orders = (data ?? []) as OrderRow[]
  if (orders.length === 0) return json({ sent: 0 })

  // Позначаємо одразу, щоб повторний виклик не надіслав дублікати.
  await db.from('orders').update({ notified_at: new Date().toISOString() }).in('id', orders.map((o) => o.id))

  const slots = await loadSlots(db)
  const base = appUrl(env, request)
  const { data: chats } = await db.from('chef_telegram').select('chef_id, chat_id').in('chef_id', orders.map((o) => o.chef_id))
  const chatByChef = new Map((chats ?? []).map((c) => [c.chef_id as string, c.chat_id as number | null]))
  const admins = adminTelegramIds(env)

  let sent = 0
  for (const order of orders) {
    const chefChat = chatByChef.get(order.chef_id)
    if (chefChat) {
      const r = await sendMessage(env.TELEGRAM_BOT_TOKEN, chefChat, newOrderText(order, slots), { text: 'Відкрити кухню', url: `${base}/kitchen` })
      if (r.ok) sent++
    }
    for (const adminId of admins) {
      if (adminId !== chefChat) await sendMessage(env.TELEGRAM_BOT_TOKEN, adminId, newOrderText(order, slots, true))
    }
  }

  const { data: profile } = await db.from('profiles').select('telegram_id').eq('id', user.id).maybeSingle()
  if (profile?.telegram_id) {
    const list = orders.map((o) => `№${o.number} від ${o.chefs?.display_name ?? 'кухаря'}`).join(', ')
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      profile.telegram_id,
      `✅ Замовлення прийнято: ${list}.\n🕐 ${whenText(orders[0], slots)}\nОплата готівкою при отриманні. Я напишу, коли статус зміниться.`,
      { text: 'Мої замовлення', url: `${base}/orders` },
    )
  }

  return json({ sent })
}
