import { adminClient, appUrl, json, userFromRequest, type Handler } from '../../_lib/env'
import { ORDER_SELECT, STATUS_LABELS, loadSlots, whenText, type OrderRow } from '../../_lib/orders'
import { sendMessage } from '../../_lib/telegram'

/** Повідомляє клієнту про зміну статусу замовлення (викликає кухар після натискання кнопки). */
export const onRequestPost: Handler = async ({ request, env }) => {
  const user = await userFromRequest(env, request)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const { orderId } = (await request.json().catch(() => ({}))) as { orderId?: string }
  if (!orderId) return json({ error: 'orderId required' }, 400)

  const db = adminClient(env)
  const { data } = await db.from('orders').select(ORDER_SELECT).eq('id', orderId).maybeSingle()
  const order = data as OrderRow | null
  if (!order) return json({ error: 'not found' }, 404)

  if (order.chef_id !== user.id) {
    const { data: me } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (me?.role !== 'admin') return json({ error: 'forbidden' }, 403)
  }

  const { data: customer } = await db.from('profiles').select('telegram_id').eq('id', order.customer_id).maybeSingle()
  if (!customer?.telegram_id || order.status === 'new') return json({ sent: false })

  const slots = await loadSlots(db)
  const base = appUrl(env, request)
  const head = `Замовлення №${order.number} (${whenText(order, slots)})`
  const texts: Record<string, string> = {
    accepted: `👍 ${head}: кухар прийняв замовлення.`,
    cooking: `🍳 ${head}: готується.`,
    ready: `📦 ${head}: готове! ${order.fulfillment === 'pickup' ? 'Можна забирати.' : 'Скоро принесемо.'}`,
    delivered: `😋 ${head}: видано. Смачного! Будь ласка, оцініть страви, це допоможе кухарю.`,
    cancelled: `❌ ${head}: скасовано. Якщо це несподівано, напишіть кухарю.`,
  }
  const text = texts[order.status] ?? `${head}: ${STATUS_LABELS[order.status] ?? order.status}.`
  const r = await sendMessage(env.TELEGRAM_BOT_TOKEN, customer.telegram_id, text, {
    text: order.status === 'delivered' ? 'Оцінити' : 'Мої замовлення',
    url: `${base}/orders`,
  })
  return json({ sent: r.ok })
}
