import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { callApi } from '../lib/api'
import { money } from '../lib/format'
import { errorText, supabase } from '../lib/supabase'
import { haptic } from '../lib/telegram'
import { CUSTOM_MAX_DAYS, addDays, customLeadLabel, customMinDate, todayIn } from '../lib/time'
import { useAuth } from '../state/auth'
import { useSettings } from '../state/settings'
import type { Dish } from '../types'

/** Оформлення страви «під замовлення»: дата, бажаний час, кількість і побажання. Окремо від кошика. */
export default function CustomOrderForm({ dish }: { dish: Dish }) {
  const { session, profile } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const minDate = customMinDate(settings, dish)
  const [date, setDate] = useState(minDate)
  const [time, setTime] = useState('')
  const [qty, setQty] = useState(1)
  const [name, setName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [apartment, setApartment] = useState(profile?.apartment ?? '')
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery')
  const [comment, setComment] = useState('')
  const [consent, setConsent] = useState(Boolean(profile?.apartment))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setName((v) => v || profile.full_name || '')
    setPhone((v) => v || profile.phone || '')
    setApartment((v) => v || profile.apartment || '')
    if (profile.apartment) setConsent(true)
  }, [profile])

  const unit = dish.unit === 'piece' ? 'шт' : 'порц.'
  const maxQty = dish.daily_limit ?? 10

  if (!session) {
    return (
      <div className="card custom-order">
        <b>{customLeadLabel(dish)}</b>
        <p className="small muted">Щоб замовити, увійдіть.</p>
        <Link className="btn" to={`/login?next=/dish/${dish.id}`}>
          Увійти
        </Link>
      </div>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (date < minDate) return setError(`Найраніша дата: ${minDate.split('-').reverse().join('.')}`)
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('place_order', {
      p_date: date,
      p_slot: 'custom',
      p_items: [{ dish_id: dish.id, qty }],
      p_customer_name: name,
      p_phone: phone,
      p_apartment: apartment,
      p_comment: comment || null,
      p_fulfillment: fulfillment,
      p_desired_time: time || null,
    })
    if (error) {
      setBusy(false)
      setError(errorText(error))
      haptic('error')
      return
    }
    await callApi('/api/notify/new-order', { orderIds: data })
    haptic('success')
    navigate('/orders?placed=1')
  }

  return (
    <form className="form card custom-order" onSubmit={submit}>
      <h2>Замовити</h2>
      <p className="small muted">{customLeadLabel(dish)}. Кухар готує саме для вас і підтвердить замовлення.</p>
      <div className="grid2">
        <label>
          Дата
          <input
            type="date"
            value={date}
            min={minDate}
            max={addDays(todayIn(settings.timezone), CUSTOM_MAX_DAYS)}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          Бажаний час
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <span>Кількість</span>
        <div className="stepper">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Менше">
            −
          </button>
          <span>
            {qty} {unit}
          </span>
          <button type="button" disabled={qty >= maxQty} onClick={() => setQty((q) => q + 1)} aria-label="Більше">
            +
          </button>
        </div>
      </div>
      <label>
        Побажання
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="напис на торті, начинка, свічки, алергії…"
        />
      </label>
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
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>
          Погоджуюсь, що імʼя, телефон і квартиру побачить кухар (<Link to="/privacy">конфіденційність</Link>).
        </span>
      </label>
      <p className="small muted">Оплата готівкою при отриманні.</p>
      {error && <p className="error">{error}</p>}
      <button className="btn wide" disabled={busy}>
        {busy ? 'Оформлюємо…' : `Замовити · ${money(dish.price_cents * qty)}`}
      </button>
    </form>
  )
}
