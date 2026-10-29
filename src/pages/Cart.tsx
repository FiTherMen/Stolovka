import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { callApi } from '../lib/api'
import { money } from '../lib/format'
import { errorText, supabase } from '../lib/supabase'
import { haptic } from '../lib/telegram'
import { dateLabel, isSlotOpen } from '../lib/time'
import { useAuth } from '../state/auth'
import { useCart } from '../state/cart'
import { useSettings } from '../state/settings'

export default function Cart() {
  const cart = useCart()
  const { session, profile } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [apartment, setApartment] = useState(profile?.apartment ?? '')
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery')
  const [comment, setComment] = useState('')
  const [consent, setConsent] = useState(Boolean(profile?.apartment))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Профіль підвантажується асинхронно: підставляємо збережені контакти, якщо поля ще порожні.
  useEffect(() => {
    if (!profile) return
    setName((v) => v || profile.full_name || '')
    setPhone((v) => v || profile.phone || '')
    setApartment((v) => v || profile.apartment || '')
    if (profile.apartment) setConsent(true)
  }, [profile])

  if (cart.lines.length === 0) {
    return (
      <div className="page center">
        <p>Кошик порожній.</p>
        <Link className="btn" to="/">
          До меню
        </Link>
      </div>
    )
  }

  const slotCfg = cart.slot ? settings.slots[cart.slot] : null
  const open = cart.date && cart.slot ? isSlotOpen(settings, cart.date, cart.slot) : false
  const byChef = new Map<string, typeof cart.lines>()
  cart.lines.forEach((l) => byChef.set(l.chef_name, [...(byChef.get(l.chef_name) ?? []), l]))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!cart.date || !cart.slot) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('place_order', {
      p_date: cart.date,
      p_slot: cart.slot,
      p_items: cart.lines.map((l) => ({ dish_id: l.dish_id, qty: l.qty })),
      p_customer_name: name,
      p_phone: phone,
      p_apartment: apartment,
      p_comment: comment || null,
      p_fulfillment: fulfillment,
    })
    if (error) {
      setBusy(false)
      setError(errorText(error))
      haptic('error')
      return
    }
    await callApi('/api/notify/new-order', { orderIds: data })
    haptic('success')
    cart.clear()
    navigate('/orders?placed=1')
  }

  return (
    <div className="page">
      <h1>Кошик</h1>
      {slotCfg && cart.date && (
        <p className="notice">
          {slotCfg.label}, {dateLabel(cart.date, settings.timezone).toLowerCase()}, видача {slotCfg.window_start}–{slotCfg.window_end}
        </p>
      )}

      {[...byChef.entries()].map(([chef, lines]) => (
        <div key={chef} className="card">
          <div className="muted small">Кухар: {chef}</div>
          {lines.map((l) => (
            <div key={l.dish_id} className="cart-line">
              <span className="grow">{l.name}</span>
              <div className="stepper">
                <button onClick={() => cart.setQty(l.dish_id, l.qty - 1)}>−</button>
                <span>{l.qty}</span>
                <button onClick={() => cart.setQty(l.dish_id, l.qty + 1)}>+</button>
              </div>
              <span className="price">{money(l.price_cents * l.qty)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="total">
        Разом: <b>{money(cart.total)}</b>
      </div>
      <p className="small muted">Оплата готівкою при отриманні.</p>

      {!open && <p className="error">Замовлення на це вікно вже закрите. Поверніться в меню й оберіть інший час.</p>}

      {!session ? (
        <div className="card">
          <p>Щоб оформити замовлення, увійдіть.</p>
          <Link className="btn" to="/login?next=/cart">
            Увійти
          </Link>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <h2>Доставка</h2>
          <div className="segmented">
            <button type="button" className={fulfillment === 'delivery' ? 'active' : ''} onClick={() => setFulfillment('delivery')}>
              До дверей
            </button>
            <button type="button" className={fulfillment === 'pickup' ? 'active' : ''} onClick={() => setFulfillment('pickup')}>
              Заберу сам
            </button>
          </div>
          <label>
            Імʼя
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
          <label>
            Телефон
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+34 …" />
          </label>
          <label>
            Квартира
            <input value={apartment} onChange={(e) => setApartment(e.target.value)} required placeholder="напр. 3-2 або 12" />
          </label>
          <label>
            Коментар
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="без цибулі, подзвонити у двері…" />
          </label>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>
              Погоджуюсь, що імʼя, телефон і квартиру побачить кухар для доставки (<Link to="/privacy">конфіденційність</Link>).
            </span>
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn wide" disabled={busy || !open}>
            {busy ? 'Оформлюємо…' : `Замовити · ${money(cart.total)}`}
          </button>
        </form>
      )}
    </div>
  )
}
