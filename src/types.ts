export type Slot = 'breakfast' | 'lunch' | 'dinner'
export type OrderStatus = 'new' | 'accepted' | 'cooking' | 'ready' | 'delivered' | 'cancelled'
export type ChefStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface SlotConfig {
  label: string
  window_start: string
  window_end: string
  cutoff_time: string
  cutoff_days_before: number
  enabled: boolean
}

export interface Settings {
  platform_fee_percent: number
  max_days_ahead: number
  timezone: string
  slots: Record<Slot, SlotConfig>
  /** До котрої години приймаються замовлення «заздалегідь», 'HH:MM' або 'HH:MM:SS'. */
  advance_cutoff_time?: string
}

export interface Profile {
  id: string
  full_name: string | null
  phone: string | null
  telegram_id: number | null
  telegram_username: string | null
  building_id: string | null
  apartment: string | null
  role: 'customer' | 'chef' | 'admin'
}

export interface Chef {
  id: string
  display_name: string
  bio: string | null
  photo_url: string | null
  phone: string | null
  status: ChefStatus
  created_at: string
}

export type Unit = 'portion' | 'piece'

export interface Dish {
  id: string
  chef_id: string
  name: string
  description: string | null
  category: string | null
  photo_urls: string[]
  price_cents: number
  weight_g: number | null
  volume_ml: number | null
  portion_note: string | null
  kcal: number | null
  protein_g: number | null
  fat_g: number | null
  carbs_g: number | null
  ingredients: string[]
  allergens: string[]
  tags: string[]
  storage_note: string | null
  slots: Slot[]
  daily_limit: number | null
  /** portion — порція, piece — штука (торт, пиріг) */
  unit: Unit
  /** За скільки днів до видачі треба замовити; 0 — як звичайно. */
  lead_days: number
  is_active: boolean
  is_hidden: boolean
  sort_order: number
  chefs?: { display_name: string } | null
}

export interface OrderItem {
  id: string
  order_id: string
  dish_id: string | null
  dish_name: string
  price_cents: number
  qty: number
  unit?: Unit
}

export interface Order {
  id: string
  number: number
  checkout_id: string
  customer_id: string
  chef_id: string
  apartment: string
  customer_name: string
  phone: string | null
  comment: string | null
  delivery_date: string
  slot: Slot
  fulfillment: 'delivery' | 'pickup'
  status: OrderStatus
  paid: boolean
  total_cents: number
  platform_fee_percent: number
  created_at: string
  order_items: OrderItem[]
  chefs?: { display_name: string } | null
}

export interface Review {
  id: string
  order_item_id: string
  dish_id: string
  chef_id: string
  author_name: string | null
  rating: number
  body: string | null
  chef_reply: string | null
  is_hidden: boolean
  created_at: string
  dishes?: { name: string } | null
}
