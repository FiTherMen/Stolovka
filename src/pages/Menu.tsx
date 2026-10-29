import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, supabase } from '../lib/supabase'
import { money, stars } from '../lib/format'
import { SLOTS, availableDates, cutoffLabel, dateLabel, isSlotOpen } from '../lib/time'
import { useCart } from '../state/cart'
import { useSettings } from '../state/settings'
import type { Dish, Settings, Slot } from '../types'

export interface Rating {
  dish_id: string
  avg_rating: number
  reviews_count: number
}

function firstOpen(settings: Settings): { date: string; slot: Slot } {
  for (const date of availableDates(settings)) {
    for (const slot of SLOTS) if (isSlotOpen(settings, date, slot)) return { date, slot }
  }
  return { date: availableDates(settings)[0], slot: 'lunch' }
}

export default function Menu() {
  const { settings } = useSettings()
  const cart = useCart()
  const [dishes, setDishes] = useState<Dish[]>([])
  const [ratings, setRatings] = useState<Record<string, Rating>>({})
  const [left, setLeft] = useState<Record<string, number>>({})
  const [chefFilter, setChefFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = availableDates(settings)
  const selection =
    cart.date && cart.slot && dates.includes(cart.date) ? { date: cart.date, slot: cart.slot } : firstOpen(settings)
  const open = isSlotOpen(settings, selection.date, selection.slot)

  useEffect(() => {
    if (!cart.date || !cart.slot || !dates.includes(cart.date)) cart.setTarget(selection.date, selection.slot)
  }, [selection.date, selection.slot])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [d, r] = await Promise.all([
        supabase
          .from('dishes')
          .select('*, chefs!inner(display_name, status)')
          .eq('is_active', true)
          .eq('is_hidden', false)
          .eq('chefs.status', 'approved')
          .order('sort_order')
          .order('name'),
        supabase.from('dish_ratings').select('*'),
      ])
      if (d.error) setError(errorText(d.error))
      setDishes((d.data as Dish[]) ?? [])
      setRatings(Object.fromEntries(((r.data as Rating[]) ?? []).map((x) => [x.dish_id, x])))
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    supabase.rpc('dishes_left', { p_date: selection.date }).then(({ data }) => {
      setLeft(Object.fromEntries(((data as { dish_id: string; left_count: number }[]) ?? []).map((x) => [x.dish_id, x.left_count])))
    })
  }, [selection.date])

  const chefs = useMemo(() => {
    const map = new Map<string, string>()
    dishes.forEach((d) => map.set(d.chef_id, d.chefs?.display_name ?? ''))
    return [...map.entries()]
  }, [dishes])

  const visible = dishes.filter((d) => d.slots.includes(selection.slot) && (!chefFilter || d.chef_id === chefFilter))
  const byCategory = useMemo(() => {
    const groups = new Map<string, Dish[]>()
    visible.forEach((d) => {
      const key = d.category || 'Інше'
      groups.set(key, [...(groups.get(key) ?? []), d])
    })
    return [...groups.entries()]
  }, [visible])

  const choose = (date: string, slot: Slot) => {
    if (date === selection.date && slot === selection.slot) return
    if (cart.count > 0 && !confirm('У кошику страви на інший час. Очистити кошик і перейти?')) return
    if (cart.count > 0) cart.clear()
    cart.setTarget(date, slot)
  }

  const slotCfg = settings.slots[selection.slot]

  return (
    <div className="page">
      <div className="chips scroll-x">
        {dates.map((d) => (
          <button key={d} className={`chip ${d === selection.date ? 'active' : ''}`} onClick={() => choose(d, selection.slot)}>
            {dateLabel(d, settings.timezone)}
          </button>
        ))}
      </div>

      <div className="tabs">
        {SLOTS.filter((s) => settings.slots[s].enabled).map((s) => (
          <button key={s} className={`tab ${s === selection.slot ? 'active' : ''}`} onClick={() => choose(selection.date, s)}>
            <span>{settings.slots[s].label}</span>
            <small>
              {settings.slots[s].window_start}–{settings.slots[s].window_end}
            </small>
          </button>
        ))}
      </div>

      <p className={`notice ${open ? '' : 'warn'}`}>
        {open
          ? `${slotCfg.label} ${dateLabel(selection.date, settings.timezone).toLowerCase()}, видача ${slotCfg.window_start}–${slotCfg.window_end}. Замовити ${cutoffLabel(settings, selection.slot)}.`
          : `Замовлення на ${slotCfg.label.toLowerCase()} ${dateLabel(selection.date, settings.timezone).toLowerCase()} вже закрите. Оберіть інший день або вікно.`}
      </p>

      {chefs.length > 1 && (
        <div className="chips scroll-x">
          <button className={`chip ${!chefFilter ? 'active' : ''}`} onClick={() => setChefFilter(null)}>
            Усі кухарі
          </button>
          {chefs.map(([id, name]) => (
            <button key={id} className={`chip ${chefFilter === id ? 'active' : ''}`} onClick={() => setChefFilter(id)}>
              {name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Завантаження меню…</p>}
      {!loading && visible.length === 0 && <p className="muted">На це вікно страв поки немає.</p>}

      {byCategory.map(([category, list]) => (
        <section key={category}>
          <h2 className="section-title">{category}</h2>
          <div className="dish-grid">
            {list.map((d) => (
              <DishCard key={d.id} dish={d} rating={ratings[d.id]} left={left[d.id]} canOrder={open} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function DishCard({ dish, rating, left, canOrder }: { dish: Dish; rating?: Rating; left?: number; canOrder: boolean }) {
  const cart = useCart()
  const qty = cart.qtyOf(dish.id)
  const soldOut = left !== undefined && left <= 0
  const maxed = left !== undefined && qty >= left
  return (
    <article className="dish-card">
      <Link to={`/dish/${dish.id}`} className="dish-photo">
        {dish.photo_urls[0] ? <img src={dish.photo_urls[0]} alt={dish.name} loading="lazy" /> : <span className="placeholder">🍲</span>}
        {soldOut && <span className="badge sold">немає</span>}
      </Link>
      <div className="dish-body">
        <Link to={`/dish/${dish.id}`} className="dish-name">
          {dish.name}
        </Link>
        <div className="muted small">
          {dish.chefs?.display_name}
          {dish.weight_g ? ` · ${dish.weight_g} г` : dish.volume_ml ? ` · ${dish.volume_ml} мл` : ''}
          {dish.kcal ? ` · ${Math.round(dish.kcal)} ккал` : ''}
        </div>
        {rating && (
          <div className="rating small">
            {stars(rating.avg_rating)} <span className="muted">{rating.avg_rating} ({rating.reviews_count})</span>
          </div>
        )}
        {left !== undefined && left > 0 && left <= 5 && <div className="small warn-text">Лишилось {left}</div>}
        <div className="dish-footer">
          <strong>{money(dish.price_cents)}</strong>
          {qty > 0 ? (
            <div className="stepper">
              <button onClick={() => cart.setQty(dish.id, qty - 1)}>−</button>
              <span>{qty}</span>
              <button disabled={!canOrder || maxed} onClick={() => cart.add(dish)}>
                +
              </button>
            </div>
          ) : (
            <button className="btn small" disabled={!canOrder || soldOut} onClick={() => cart.add(dish)}>
              Додати
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
