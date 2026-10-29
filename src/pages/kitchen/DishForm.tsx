import { confirmAction } from '../../lib/confirm'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ALLERGENS, TAGS } from '../../lib/allergens'
import { resizeImage } from '../../lib/images'
import { errorText, supabase } from '../../lib/supabase'
import { SLOTS } from '../../lib/time'
import { useAuth } from '../../state/auth'
import { useSettings } from '../../state/settings'
import type { Dish, Slot } from '../../types'

interface FormState {
  name: string
  description: string
  category: string
  price: string
  weight_g: string
  volume_ml: string
  portion_note: string
  kcal: string
  protein_g: string
  fat_g: string
  carbs_g: string
  ingredients: string
  allergens: string[]
  tags: string[]
  storage_note: string
  slots: Slot[]
  daily_limit: string
  photo_urls: string[]
  is_active: boolean
}

const EMPTY: FormState = {
  name: '',
  description: '',
  category: '',
  price: '',
  weight_g: '',
  volume_ml: '',
  portion_note: '',
  kcal: '',
  protein_g: '',
  fat_g: '',
  carbs_g: '',
  ingredients: '',
  allergens: [],
  tags: [],
  storage_note: 'Зберігати в холодильнику, зʼїсти протягом 24 год',
  slots: ['lunch', 'dinner'],
  daily_limit: '',
  photo_urls: [],
  is_active: true,
}

const str = (v: number | null | undefined) => (v == null ? '' : String(v))
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
const CATEGORIES = ['Сніданки', 'Перші страви', 'Другі страви', 'Комплекси', 'Салати', 'Закуски', 'Випічка', 'Десерти', 'Напої']

export default function DishForm() {
  const { id } = useParams()
  const { chef } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [f, setF] = useState<FormState>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    supabase
      .from('dishes')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        const d = data as Dish | null
        if (!d) return
        setF({
          name: d.name,
          description: d.description ?? '',
          category: d.category ?? '',
          price: (d.price_cents / 100).toFixed(2),
          weight_g: str(d.weight_g),
          volume_ml: str(d.volume_ml),
          portion_note: d.portion_note ?? '',
          kcal: str(d.kcal),
          protein_g: str(d.protein_g),
          fat_g: str(d.fat_g),
          carbs_g: str(d.carbs_g),
          ingredients: d.ingredients.join(', '),
          allergens: d.allergens,
          tags: d.tags,
          storage_note: d.storage_note ?? '',
          slots: d.slots,
          daily_limit: str(d.daily_limit),
          photo_urls: d.photo_urls,
          is_active: d.is_active,
        })
      })
  }, [id])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((s) => ({ ...s, [key]: value }))
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const upload = async (files: FileList | null) => {
    if (!files || !chef) return
    setUploading(true)
    setError(null)
    try {
      const urls: string[] = []
      for (const file of [...files].slice(0, 3 - f.photo_urls.length)) {
        const blob = await resizeImage(file)
        const path = `${chef.id}/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('dish-photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        urls.push(supabase.storage.from('dish-photos').getPublicUrl(path).data.publicUrl)
      }
      setF((s) => ({ ...s, photo_urls: [...s.photo_urls, ...urls].slice(0, 3) }))
    } catch (e) {
      setError(errorText(e))
    }
    setUploading(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!chef) return
    if (f.slots.length === 0) return setError('Оберіть хоча б одне вікно: сніданок, обід або вечеря')
    setBusy(true)
    setError(null)
    const row = {
      chef_id: chef.id,
      name: f.name.trim(),
      description: f.description.trim() || null,
      category: f.category.trim() || null,
      price_cents: Math.round((num(f.price) ?? 0) * 100),
      weight_g: num(f.weight_g),
      volume_ml: num(f.volume_ml),
      portion_note: f.portion_note.trim() || null,
      kcal: num(f.kcal),
      protein_g: num(f.protein_g),
      fat_g: num(f.fat_g),
      carbs_g: num(f.carbs_g),
      ingredients: f.ingredients
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      allergens: f.allergens,
      tags: f.tags,
      storage_note: f.storage_note.trim() || null,
      slots: f.slots,
      daily_limit: num(f.daily_limit),
      photo_urls: f.photo_urls,
      is_active: f.is_active,
    }
    const { error } = id ? await supabase.from('dishes').update(row).eq('id', id) : await supabase.from('dishes').insert(row)
    setBusy(false)
    if (error) setError(errorText(error))
    else navigate('/kitchen/dishes')
  }

  const remove = async () => {
    if (!id || !confirmAction('Видалити страву назавжди? Краще просто вимкнути її, щоб зберегти відгуки.')) return
    const { error } = await supabase.from('dishes').delete().eq('id', id)
    if (error) setError(errorText(error))
    else navigate('/kitchen/dishes')
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>{id ? 'Редагувати страву' : 'Нова страва'}</h2>

      <div className="photos">
        {f.photo_urls.map((u) => (
          <div key={u} className="photo">
            <img src={u} alt="" />
            <button type="button" onClick={() => set('photo_urls', f.photo_urls.filter((x) => x !== u))} aria-label="Прибрати фото">
              ×
            </button>
          </div>
        ))}
        {f.photo_urls.length < 3 && (
          <label className="photo add">
            {uploading ? '…' : '+ фото'}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          </label>
        )}
      </div>
      <p className="small muted">До 3 фото. Перше фото показується в меню.</p>

      <label>
        Назва*
        <input value={f.name} onChange={(e) => set('name', e.target.value)} required />
      </label>
      <label>
        Опис
        <textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={3} />
      </label>
      <label>
        Категорія
        <input value={f.category} onChange={(e) => set('category', e.target.value)} list="categories" placeholder="напр. Перші страви" />
        <datalist id="categories">
          {CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <div className="grid2">
        <label>
          Ціна, €*
          <input value={f.price} onChange={(e) => set('price', e.target.value)} inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" />
        </label>
        <label>
          Ліміт порцій на день
          <input value={f.daily_limit} onChange={(e) => set('daily_limit', e.target.value)} inputMode="numeric" placeholder="без ліміту" />
        </label>
        <label>
          Вага порції, г
          <input value={f.weight_g} onChange={(e) => set('weight_g', e.target.value)} inputMode="numeric" />
        </label>
        <label>
          Обʼєм, мл (для напоїв)
          <input value={f.volume_ml} onChange={(e) => set('volume_ml', e.target.value)} inputMode="numeric" />
        </label>
      </div>
      <label>
        Що входить у порцію
        <input value={f.portion_note} onChange={(e) => set('portion_note', e.target.value)} placeholder="борщ 350 г, сметана 20 г, пампушка 50 г" />
      </label>

      <fieldset>
        <legend>КБЖУ на порцію</legend>
        <div className="grid4">
          <label>
            ккал
            <input value={f.kcal} onChange={(e) => set('kcal', e.target.value)} inputMode="decimal" />
          </label>
          <label>
            білки, г
            <input value={f.protein_g} onChange={(e) => set('protein_g', e.target.value)} inputMode="decimal" />
          </label>
          <label>
            жири, г
            <input value={f.fat_g} onChange={(e) => set('fat_g', e.target.value)} inputMode="decimal" />
          </label>
          <label>
            вуглеводи, г
            <input value={f.carbs_g} onChange={(e) => set('carbs_g', e.target.value)} inputMode="decimal" />
          </label>
        </div>
      </fieldset>

      <label>
        Склад (через кому)
        <textarea value={f.ingredients} onChange={(e) => set('ingredients', e.target.value)} rows={2} />
      </label>

      <fieldset>
        <legend>Алергени (14 алергенів ЄС, обовʼязково перевірте)</legend>
        <div className="chips wrap">
          {Object.entries(ALLERGENS).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={`chip ${f.allergens.includes(key) ? 'active' : ''}`}
              onClick={() => set('allergens', toggleIn(f.allergens, key))}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Мітки</legend>
        <div className="chips wrap">
          {Object.entries(TAGS).map(([key, label]) => (
            <button type="button" key={key} className={`chip ${f.tags.includes(key) ? 'active' : ''}`} onClick={() => set('tags', toggleIn(f.tags, key))}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Коли готуєте</legend>
        <div className="chips wrap">
          {SLOTS.map((s) => (
            <button type="button" key={s} className={`chip ${f.slots.includes(s) ? 'active' : ''}`} onClick={() => set('slots', toggleIn(f.slots, s))}>
              {settings.slots[s].label}
            </button>
          ))}
        </div>
      </fieldset>

      <label>
        Зберігання
        <input value={f.storage_note} onChange={(e) => set('storage_note', e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} />
        <span>Показувати в меню</span>
      </label>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="btn" disabled={busy || uploading}>
          Зберегти
        </button>
        <button type="button" className="btn ghost" onClick={() => navigate('/kitchen/dishes')}>
          Назад
        </button>
        {id && (
          <button type="button" className="btn danger" onClick={remove}>
            Видалити
          </button>
        )}
      </div>
    </form>
  )
}
