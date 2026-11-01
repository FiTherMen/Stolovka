import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { unitShort } from '../../lib/format'
import { errorText, supabase } from '../../lib/supabase'
import { ORDER_SLOTS, addDays, dateLabel, slotTitle, slotWindow, todayIn } from '../../lib/time'
import { useAuth } from '../../state/auth'
import { useSettings } from '../../state/settings'
import type { Order, OrderSlot } from '../../types'

interface Line {
  name: string
  unit: string
  total: number
  bySlot: Partial<Record<OrderSlot, number>>
}

/** «Що готувати»: усе, що треба приготувати на обраний день (за замовчуванням завтра), разом і по квартирах. */
export default function KitchenPrep() {
  const { chef } = useAuth()
  const { settings } = useSettings()
  const today = todayIn(settings.timezone)
  const [date, setDate] = useState(addDays(today, 1))
  const [orders, setOrders] = useState<Order[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!chef) return
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('chef_id', chef.id)
      .eq('delivery_date', date)
      .neq('status', 'cancelled')
      .order('created_at')
    if (error) setError(errorText(error))
    setOrders((data as Order[]) ?? [])
    setLoaded(true)
  }, [chef, date])

  useEffect(() => {
    void load()
  }, [load])

  const lines = useMemo(() => {
    const map = new Map<string, Line>()
    orders.forEach((o) =>
      o.order_items.forEach((i) => {
        const key = i.dish_id ?? i.dish_name
        const line = map.get(key) ?? {
          name: i.dish_name,
          unit: i.unit ?? 'portion',
          total: 0,
          bySlot: {},
        }
        line.total += i.qty
        line.bySlot[o.slot] = (line.bySlot[o.slot] ?? 0) + i.qty
        map.set(key, line)
      }),
    )
    // Штучне (торти) першим: його зазвичай готують заздалегідь.
    return [...map.values()].sort((a, b) => (a.unit === b.unit ? b.total - a.total : a.unit === 'piece' ? -1 : 1))
  }, [orders])

  const notAccepted = orders.filter((o) => o.status === 'new').length
  const dates = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => addDays(today, n))
  if (!dates.includes(date)) dates.push(date)
  const slotLabel = (s: OrderSlot) => slotTitle(settings, s).toLowerCase()

  return (
    <div>
      <div className="chips scroll-x">
        {dates.map((d) => (
          <button key={d} className={`chip ${d === date ? 'active' : ''}`} onClick={() => setDate(d)}>
            {dateLabel(d, settings.timezone)}
          </button>
        ))}
      </div>
      <label className="inline-date small muted">
        Інша дата: <input type="date" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      {loaded && orders.length === 0 && (
        <p className="muted">На {dateLabel(date, settings.timezone).toLowerCase()} замовлень поки немає.</p>
      )}

      {lines.length > 0 && (
        <>
          <div className="card prep prep-total">
            <div className="row">
              <b>Разом на {dateLabel(date, settings.timezone).toLowerCase()}</b>
              <span className="small muted">{orders.length} замовл.</span>
            </div>
            {lines.map((l) => (
              <div key={l.name} className="prep-line">
                <div className="row">
                  <span>
                    {l.name}
                    {l.unit === 'piece' && <em className="unit-badge">поштучно</em>}
                  </span>
                  <b>
                    {l.total} {unitShort(l.unit)}
                  </b>
                </div>
                <div className="small muted">
                  {ORDER_SLOTS.filter((s) => l.bySlot[s])
                    .map((s) => `${slotLabel(s)} ${l.bySlot[s]}`)
                    .join(' · ')}
                </div>
              </div>
            ))}
          </div>
          {notAccepted > 0 && (
            <Link className="notice notice-btn" to="/kitchen">
              Ще не прийнято замовлень: {notAccepted}. Вони вже враховані в списку. Відкрити замовлення →
            </Link>
          )}

          <h2 className="section-title">По квартирах</h2>
          {ORDER_SLOTS.map((slot) => {
            const list = orders.filter((o) => o.slot === slot)
            if (list.length === 0) return null
            return (
              <section key={slot}>
                <h3 className="small-title">
                  {slotTitle(settings, slot)}
                  {slot !== 'custom' && ` · ${slotWindow(settings, slot)}`}
                </h3>
                {list.map((o) => (
                  <div key={o.id} className="card prep-order">
                    <div className="row">
                      <b>{o.fulfillment === 'pickup' ? 'Самовивіз' : `Кв. ${o.apartment}`}</b>
                      <span className="small muted">
                        {o.slot === 'custom' && `${slotWindow(settings, o.slot, o.desired_time)} · `}№{o.number} · {o.customer_name}
                      </span>
                    </div>
                    {o.order_items.map((i) => (
                      <div key={i.id} className="row small">
                        <span>{i.dish_name}</span>
                        <span>
                          {i.qty} {unitShort(i.unit)}
                        </span>
                      </div>
                    ))}
                    {o.comment && <div className="small comment">💬 {o.comment}</div>}
                  </div>
                ))}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
