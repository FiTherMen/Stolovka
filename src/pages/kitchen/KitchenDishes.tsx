import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { seedDishRows } from '../../data/seed'
import { money } from '../../lib/format'
import { Plate } from '../../components/Brand'
import { errorText, supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth'
import { useSettings } from '../../state/settings'
import { confirmAction } from '../../lib/confirm'
import type { Dish } from '../../types'

export default function KitchenDishes() {
  const { chef } = useAuth()
  const { settings } = useSettings()
  const [dishes, setDishes] = useState<Dish[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!chef) return
    const { data } = await supabase.from('dishes').select('*').eq('chef_id', chef.id).order('sort_order').order('name')
    setDishes((data as Dish[]) ?? [])
    setLoading(false)
  }, [chef])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (d: Dish) => {
    const { error } = await supabase.from('dishes').update({ is_active: !d.is_active }).eq('id', d.id)
    if (error) setError(errorText(error))
    void load()
  }

  const importSeed = async () => {
    if (!chef || !confirmAction('Додати 10 тестових українських страв? Їх можна буде змінити або видалити.')) return
    const rows = seedDishRows(chef.id)
    const { error } = await supabase.from('dishes').insert(rows)
    if (error) setError(errorText(error))
    void load()
  }

  // Чому клієнт не бачить страву в меню (null — бачить).
  const hiddenReason = (d: Dish): string | null => {
    if (chef?.status === 'pending') return 'Клієнти не бачать: заявка кухаря ще чекає схвалення адміністратора'
    if (chef && chef.status !== 'approved') return 'Клієнти не бачать: кабінет кухаря не активний'
    if (!d.is_active) return 'Клієнти не бачать: страву вимкнено (перемикач праворуч)'
    if (d.is_hidden) return 'Клієнти не бачать: приховано адміністратором'
    return null
  }

  return (
    <div>
      <div className="row">
        <Link className="btn" to="/kitchen/dishes/new">
          + Нова страва
        </Link>
        {!loading && dishes.length === 0 && (
          <button className="btn ghost" onClick={importSeed}>
            Тестове меню
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {!loading && dishes.length === 0 && <p className="muted">Страв ще немає. Додайте першу або завантажте тестове меню.</p>}
      {dishes.map((d) => (
        <div key={d.id} className={`card dish-row ${d.is_active ? '' : 'dim'}`}>
          <Plate src={d.photo_urls[0]} />
          <div className="grow">
            <Link to={`/kitchen/dishes/${d.id}`}>
              <b>{d.name}</b>
            </Link>
            <div className="small muted">
              {money(d.price_cents)} · {d.slots.map((s) => settings.slots[s].label.toLowerCase()).join(', ')}
              {d.daily_limit ? ` · ліміт ${d.daily_limit}/день` : ''}
            </div>
            <div className={`small ${hiddenReason(d) ? 'warn-text' : 'ok-text'}`}>
              {hiddenReason(d) ?? `Клієнти бачать у меню: ${d.slots.map((s) => settings.slots[s].label.toLowerCase()).join(', ')}`}
            </div>
          </div>
          <label className="switch" title={d.is_active ? 'У меню' : 'Вимкнено'}>
            <input type="checkbox" checked={d.is_active} onChange={() => toggle(d)} />
            <span />
          </label>
        </div>
      ))}
    </div>
  )
}
