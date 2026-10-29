import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import seed from '../../data/dishes-seed.json'
import { money } from '../../lib/format'
import { errorText, supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth'
import { useSettings } from '../../state/settings'
import type { Dish, Slot } from '../../types'

interface SeedDish {
  name: string
  category: string
  description: string
  weight_g: number | null
  volume_ml: number | null
  portion: string
  nutrition_per_portion: { kcal: number; protein_g: number; fat_g: number; carbs_g: number }
  ingredients: string[]
  allergens: string[]
  price_eur: number
  vegetarian: boolean
}

function seedSlots(category: string): Slot[] {
  if (category === 'Сніданки') return ['breakfast']
  if (category === 'Напої' || category === 'Десерти') return ['breakfast', 'lunch', 'dinner']
  return ['lunch', 'dinner']
}

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
    if (!chef || !confirm('Додати 10 тестових українських страв? Їх можна буде змінити або видалити.')) return
    const rows = (seed.dishes as SeedDish[]).map((d, i) => ({
      chef_id: chef.id,
      name: d.name,
      category: d.category,
      description: d.description,
      weight_g: d.weight_g,
      volume_ml: d.volume_ml,
      portion_note: d.portion,
      kcal: d.nutrition_per_portion.kcal,
      protein_g: d.nutrition_per_portion.protein_g,
      fat_g: d.nutrition_per_portion.fat_g,
      carbs_g: d.nutrition_per_portion.carbs_g,
      ingredients: d.ingredients,
      allergens: d.allergens,
      tags: d.vegetarian ? ['vegetarian'] : [],
      price_cents: Math.round(d.price_eur * 100),
      slots: seedSlots(d.category),
      sort_order: i,
    }))
    const { error } = await supabase.from('dishes').insert(rows)
    if (error) setError(errorText(error))
    void load()
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
          {d.photo_urls[0] ? <img src={d.photo_urls[0]} alt="" /> : <span className="placeholder">🍲</span>}
          <div className="grow">
            <Link to={`/kitchen/dishes/${d.id}`}>
              <b>{d.name}</b>
            </Link>
            <div className="small muted">
              {money(d.price_cents)} · {d.slots.map((s) => settings.slots[s].label.toLowerCase()).join(', ')}
              {d.daily_limit ? ` · ліміт ${d.daily_limit}/день` : ''}
              {d.is_hidden ? ' · приховано адміністратором' : ''}
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
