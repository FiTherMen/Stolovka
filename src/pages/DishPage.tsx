import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { allergenLabel, TAGS } from '../lib/allergens'
import { money, stars, dishEmoji } from '../lib/format'
import { supabase } from '../lib/supabase'
import { isSlotOpen } from '../lib/time'
import { useCart } from '../state/cart'
import { useSettings } from '../state/settings'
import type { Dish, Review } from '../types'

export default function DishPage() {
  const { id } = useParams()
  const { settings } = useSettings()
  const cart = useCart()
  const [dish, setDish] = useState<Dish | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [photo, setPhoto] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [d, r] = await Promise.all([
        supabase.from('dishes').select('*, chefs(display_name)').eq('id', id).maybeSingle(),
        supabase.from('reviews').select('*').eq('dish_id', id).eq('is_hidden', false).order('created_at', { ascending: false }),
      ])
      setDish(d.data as Dish | null)
      setReviews((r.data as Review[]) ?? [])
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="page muted">Завантаження…</div>
  if (!dish) return <div className="page">Страву не знайдено. <Link to="/">До меню</Link></div>

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
  const slotOk = cart.slot ? dish.slots.includes(cart.slot) : false
  const open = cart.date && cart.slot ? isSlotOpen(settings, cart.date, cart.slot) : false
  const qty = cart.qtyOf(dish.id)

  return (
    <div className="page dish-page">
      <div className="gallery">
        {dish.photo_urls.length ? <img src={dish.photo_urls[photo]} alt={dish.name} /> : <div className="placeholder big">{dishEmoji(dish.category)}</div>}
        {dish.photo_urls.length > 1 && (
          <div className="thumbs">
            {dish.photo_urls.map((u, i) => (
              <button key={u} className={i === photo ? 'active' : ''} onClick={() => setPhoto(i)}>
                <img src={u} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <h1>{dish.name}</h1>
      <p className="muted">
        Кухар: {dish.chefs?.display_name}
        {reviews.length > 0 && (
          <>
            {' · '}
            <span className="rating">{stars(avg)}</span> {avg.toFixed(1)} ({reviews.length})
          </>
        )}
      </p>
      {dish.description && <p>{dish.description}</p>}

      <div className="facts">
        <div>
          <b>{money(dish.price_cents)}</b>
          <span>ціна</span>
        </div>
        {(dish.weight_g || dish.volume_ml) && (
          <div>
            <b>{dish.weight_g ? `${dish.weight_g} г` : `${dish.volume_ml} мл`}</b>
            <span>порція</span>
          </div>
        )}
        {dish.kcal != null && (
          <div>
            <b>{Math.round(dish.kcal)}</b>
            <span>ккал</span>
          </div>
        )}
        {dish.protein_g != null && (
          <div>
            <b>{dish.protein_g}</b>
            <span>білки, г</span>
          </div>
        )}
        {dish.fat_g != null && (
          <div>
            <b>{dish.fat_g}</b>
            <span>жири, г</span>
          </div>
        )}
        {dish.carbs_g != null && (
          <div>
            <b>{dish.carbs_g}</b>
            <span>вуглеводи, г</span>
          </div>
        )}
      </div>
      {dish.portion_note && <p className="small muted">Порція: {dish.portion_note}</p>}

      {dish.ingredients.length > 0 && (
        <>
          <h3>Склад</h3>
          <p>{dish.ingredients.join(', ')}</p>
        </>
      )}

      <h3>Алергени</h3>
      {dish.allergens.length ? (
        <div className="chips wrap">
          {dish.allergens.map((a) => (
            <span key={a} className="chip allergen">
              {allergenLabel(a)}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted">Кухар не вказав алергенів з переліку ЄС.</p>
      )}

      {dish.tags.length > 0 && (
        <div className="chips wrap">
          {dish.tags.map((t) => (
            <span key={t} className="chip">
              {TAGS[t] ?? t}
            </span>
          ))}
        </div>
      )}
      {dish.storage_note && <p className="small muted">Зберігання: {dish.storage_note}</p>}

      <div className="sticky-action">
        {slotOk && open ? (
          <button className="btn wide" onClick={() => cart.add(dish)}>
            {qty > 0 ? `Ще одну · у кошику ${qty}` : `Додати в кошик · ${money(dish.price_cents)}`}
          </button>
        ) : (
          <p className="muted small">Цю страву не готують на обране вікно, або замовлення вже закрите.</p>
        )}
      </div>

      <h3>Відгуки</h3>
      {reviews.length === 0 && <p className="muted">Ще немає відгуків.</p>}
      {reviews.map((r) => (
        <div key={r.id} className="review">
          <div>
            <span className="rating">{stars(r.rating)}</span> <b>{r.author_name || 'Клієнт'}</b>{' '}
            <span className="muted small">{new Date(r.created_at).toLocaleDateString('uk-UA')}</span>
          </div>
          {r.body && <p>{r.body}</p>}
          {r.chef_reply && <p className="reply">Кухар: {r.chef_reply}</p>}
        </div>
      ))}
    </div>
  )
}
