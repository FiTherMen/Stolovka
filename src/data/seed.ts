import seed from './dishes-seed.json'
import type { Dish, Slot } from '../types'

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

/** Тестове меню (10 українських страв) у форматі таблиці dishes, без id. */
export function seedDishRows(chefId: string): Omit<Dish, 'id' | 'is_hidden' | 'chefs'>[] {
  return (seed.dishes as SeedDish[]).map((d, i) => ({
    chef_id: chefId,
    name: d.name,
    category: d.category,
    description: d.description,
    photo_urls: [],
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
    storage_note: 'Зберігати в холодильнику, зʼїсти протягом 24 год',
    price_cents: Math.round(d.price_eur * 100),
    slots: seedSlots(d.category),
    daily_limit: null,
    is_active: true,
    sort_order: i,
  }))
}
