import { confirmAction } from '../../lib/confirm'
import { useCallback, useEffect, useRef, useState } from 'react'
import { callApi } from '../../lib/api'
import { NEXT_STATUS, STATUS_LABELS, money, unitShort } from '../../lib/format'
import { errorText, supabase } from '../../lib/supabase'
import { SLOTS, addDays, dateLabel, todayIn } from '../../lib/time'
import { useAuth } from '../../state/auth'
import { useNewOrders } from '../../state/newOrders'
import { useSettings } from '../../state/settings'
import type { Order, OrderStatus } from '../../types'

const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  accepted: 'Прийняти',
  cooking: 'Готую',
  ready: 'Готово',
  delivered: 'Видано і оплачено',
}

export default function KitchenOrders() {
  const { chef } = useAuth()
  const { settings } = useSettings()
  const today = todayIn(settings.timezone)
  const [date, setDate] = useState(today)
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const fresh = useNewOrders(chef?.id, settings.timezone)
  const autoPicked = useRef(false)

  // Відкриваємо найближчий день з новими замовленнями (напр. «Завтра», якщо замовили на завтрашній обід).
  useEffect(() => {
    if (!fresh.loaded || autoPicked.current) return
    autoPicked.current = true
    if (fresh.byDate[today]) return
    const first = Object.keys(fresh.byDate).filter((d) => d >= today).sort()[0]
    if (first) setDate(first)
  }, [fresh.loaded, fresh.byDate, today])

  const load = useCallback(async () => {
    if (!chef) return
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('chef_id', chef.id)
      .eq('delivery_date', date)
      .order('created_at')
    if (error) setError(errorText(error))
    setOrders((data as Order[]) ?? [])
  }, [chef, date])

  useEffect(() => {
    void load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  const setStatus = async (order: Order, status: OrderStatus) => {
    if (status === 'cancelled' && !confirmAction(`Скасувати замовлення №${order.number}?`)) return
    const { error } = await supabase.rpc('set_order_status', {
      p_order_id: order.id,
      p_status: status,
      p_paid: status === 'delivered' ? true : null,
    })
    if (error) return setError(errorText(error))
    void callApi('/api/notify/status', { orderId: order.id })
    void load()
    void fresh.reload()
  }

  const active = orders.filter((o) => o.status !== 'cancelled')
  const dates = [-1, 0, 1, 2, 3, 4, 5, 6, 7].map((n) => addDays(today, n))
  const laterNew = Object.entries(fresh.byDate)
    .filter(([d, n]) => d !== date && d >= today && n > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))

  return (
    <div>
      <div className="chips scroll-x">
        {dates.map((d) => (
          <button key={d} className={`chip ${d === date ? 'active' : ''}`} onClick={() => setDate(d)}>
            {d === addDays(today, -1) ? 'Вчора' : dateLabel(d, settings.timezone)}
            {fresh.byDate[d] > 0 && <em className="chip-count">{fresh.byDate[d]}</em>}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {orders.length === 0 && <p className="muted">На цей день замовлень немає.</p>}
      {laterNew.length > 0 && (
        <button className="notice notice-btn" onClick={() => setDate(laterNew[0][0])}>
          Нові замовлення: {laterNew.map(([d, n]) => `${dateLabel(d, settings.timezone).toLowerCase()} (${n})`).join(', ')}. Показати →
        </button>
      )}

      {SLOTS.map((slot) => {
        const list = orders.filter((o) => o.slot === slot)
        if (list.length === 0) return null
        const cfg = settings.slots[slot]
        const summary = new Map<string, { qty: number; unit?: string }>()
        list
          .filter((o) => o.status !== 'cancelled')
          .forEach((o) =>
            o.order_items.forEach((i) => summary.set(i.dish_name, { qty: (summary.get(i.dish_name)?.qty ?? 0) + i.qty, unit: i.unit })),
          )
        return (
          <section key={slot}>
            <h2 className="section-title">
              {cfg.label} · {cfg.window_start}–{cfg.window_end}
            </h2>
            <div className="card prep">
              <b>Що готувати:</b>
                  {[...summary.entries()].map(([name, { qty, unit }]) => (
                <div key={name} className="row">
                  <span>{name}</span>
                  <b>
                    {qty} {unitShort(unit)}
                  </b>
                </div>
              ))}
            </div>
            {list.map((o) => (
              <div key={o.id} className={`card ${o.status === 'cancelled' ? 'dim' : ''}`}>
                <div className="row">
                  <b>
                    №{o.number} · {o.fulfillment === 'pickup' ? 'самовивіз' : `кв. ${o.apartment}`}
                  </b>
                  <span className={`status status-${o.status}`}>{STATUS_LABELS[o.status]}</span>
                </div>
                <div className="small">
                  {o.customer_name}
                  {o.phone && (
                    <>
                      {' · '}
                      <a href={`tel:${o.phone}`}>{o.phone}</a>
                    </>
                  )}
                </div>
                {o.comment && <div className="small comment">💬 {o.comment}</div>}
                {o.order_items.map((i) => (
                  <div key={i.id} className="cart-line">
                    <span className="grow">
                      {i.dish_name} × {i.qty}
                      {i.unit === 'piece' ? ' шт' : ''}
                    </span>
                    <span className="price">{money(i.price_cents * i.qty)}</span>
                  </div>
                ))}
                <div className="row">
                  <b>{money(o.total_cents)}</b>
                  <span className="small muted">{o.paid ? 'оплачено' : 'готівка'}</span>
                </div>
                <div className="actions">
                  {NEXT_STATUS[o.status] && (
                    <button className="btn small" onClick={() => setStatus(o, NEXT_STATUS[o.status]!)}>
                      {ACTION_LABELS[NEXT_STATUS[o.status]!]}
                    </button>
                  )}
                  {o.status !== 'delivered' && o.status !== 'cancelled' && (
                    <button className="btn small ghost" onClick={() => setStatus(o, 'cancelled')}>
                      Скасувати
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )
      })}
      {active.length > 0 && (
        <p className="total">
          Разом за день: <b>{money(active.reduce((s, o) => s + o.total_cents, 0))}</b>
        </p>
      )}
    </div>
  )
}
