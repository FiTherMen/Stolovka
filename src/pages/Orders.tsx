import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { STATUS_LABELS, money } from '../lib/format'
import { errorText, supabase } from '../lib/supabase'
import { dateLabel } from '../lib/time'
import { useAuth } from '../state/auth'
import { useCart } from '../state/cart'
import { useSettings } from '../state/settings'
import type { Dish, Order } from '../types'

export default function Orders() {
  const { session } = useAuth()
  const { settings } = useSettings()
  const cart = useCart()
  const [params] = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(params.get('placed') ? 'Дякуємо! Замовлення прийнято, кухар отримав сповіщення.' : null)

  const load = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*), chefs(display_name)')
      .eq('customer_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    const list = (data as Order[]) ?? []
    setOrders(list)
    const itemIds = list.flatMap((o) => o.order_items.map((i) => i.id))
    if (itemIds.length) {
      const { data: r } = await supabase.from('reviews').select('order_item_id').in('order_item_id', itemIds)
      setReviewed(new Set(((r as { order_item_id: string }[]) ?? []).map((x) => x.order_item_id)))
    }
    setLoading(false)
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  if (!session) {
    return (
      <div className="page center">
        <p>Увійдіть, щоб бачити свої замовлення.</p>
        <Link className="btn" to="/login?next=/orders">
          Увійти
        </Link>
      </div>
    )
  }

  const repeat = async (order: Order) => {
    const ids = order.order_items.map((i) => i.dish_id).filter(Boolean) as string[]
    const { data } = await supabase.from('dishes').select('*, chefs(display_name)').in('id', ids).eq('is_active', true)
    const dishes = (data as Dish[]) ?? []
    if (cart.count > 0) cart.clear()
    order.order_items.forEach((i) => {
      const d = dishes.find((x) => x.id === i.dish_id)
      if (d) cart.add(d, i.qty)
    })
    setMessage(
      dishes.length < ids.length
        ? 'Частини страв уже немає в меню, решту додано в кошик. Перевірте день і вікно в меню.'
        : 'Страви додано в кошик. Перевірте день і вікно в меню.',
    )
  }

  const cancel = async (order: Order) => {
    if (!confirm('Скасувати замовлення?')) return
    const { error } = await supabase.rpc('cancel_my_order', { p_order_id: order.id })
    if (error) setMessage(errorText(error))
    void load()
  }

  return (
    <div className="page">
      <h1>Мої замовлення</h1>
      {message && <p className="notice">{message}</p>}
      {loading && <p className="muted">Завантаження…</p>}
      {!loading && orders.length === 0 && <p className="muted">Замовлень ще немає.</p>}
      {orders.map((o) => (
        <div key={o.id} className="card">
          <div className="row">
            <b>№{o.number}</b>
            <span className={`status status-${o.status}`}>{STATUS_LABELS[o.status]}</span>
          </div>
          <div className="muted small">
            {dateLabel(o.delivery_date, settings.timezone)}, {settings.slots[o.slot].label.toLowerCase()} {settings.slots[o.slot].window_start}–
            {settings.slots[o.slot].window_end} · кухар {o.chefs?.display_name}
          </div>
          {o.order_items.map((i) => (
            <div key={i.id}>
              <div className="cart-line">
                <span className="grow">
                  {i.dish_name} × {i.qty}
                </span>
                <span className="price">{money(i.price_cents * i.qty)}</span>
              </div>
              {o.status === 'delivered' && i.dish_id && !reviewed.has(i.id) && (
                <ReviewForm itemId={i.id} onDone={() => setReviewed((s) => new Set(s).add(i.id))} />
              )}
            </div>
          ))}
          <div className="row">
            <b>{money(o.total_cents)}</b>
            <span className="small muted">{o.paid ? 'оплачено' : 'готівкою при отриманні'}</span>
          </div>
          <div className="actions">
            <button className="btn small ghost" onClick={() => repeat(o)}>
              Повторити
            </button>
            {o.status === 'new' && (
              <button className="btn small danger" onClick={() => cancel(o)}>
                Скасувати
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ReviewForm({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('leave_review', { p_order_item_id: itemId, p_rating: rating, p_body: body || null })
    setBusy(false)
    if (error) setError(errorText(error))
    else onDone()
  }

  return (
    <div className="review-form">
      <div className="star-input">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} зірок`}>
            ★
          </button>
        ))}
        <span className="small muted">оцініть страву</span>
      </div>
      {rating > 0 && (
        <>
          <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Відгук (необовʼязково)" />
          <button className="btn small" disabled={busy} onClick={send}>
            Надіслати
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
