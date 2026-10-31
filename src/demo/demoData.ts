import { seedDishRows } from '../data/seed'
import { DEFAULT_SETTINGS, addDays, todayIn } from '../lib/time'

export type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DemoDb {
  settings: Row[]
  profiles: Row[]
  chefs: Row[]
  chef_telegram: Row[]
  dishes: Row[]
  orders: Row[]
  order_items: Row[]
  reviews: Row[]
  counters: { order: number }
  builtOn: string
}

export const DEMO_USERS = {
  customer: 'demo-customer',
  chef: 'demo-chef',
  admin: 'demo-admin',
}

const PENDING_CHEF = 'demo-chef-2'


/** Ілюстрації-заглушки для демо-галереї (SVG, без зовнішніх файлів). */
function demoPhoto(bg: string, cream: string, layers: number): string {
  const rows = Array.from({ length: layers }, (_, k) => `<rect x="80" y="${280 - k * 22}" width="240" height="22" rx="4" fill="${k % 2 ? cream : bg}"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#f6e3bf"/><ellipse cx="200" cy="310" rx="175" ry="55" fill="#fffaf0"/>${rows}<rect x="76" y="${280 - layers * 22}" width="248" height="24" rx="10" fill="${cream}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Тестові дані демо: кухарка з 10 стравами, кухар на схваленні, замовлення і відгуки відносно сьогоднішньої дати. */
export function buildDemoDb(): DemoDb {
  const today = todayIn(DEFAULT_SETTINGS.timezone)
  const yesterday = addDays(today, -1)
  const tomorrow = addDays(today, 1)
  const now = new Date().toISOString()

  const dishes: Row[] = seedDishRows(DEMO_USERS.chef).map((d, i) => ({
    ...d,
    id: `dish-${i + 1}`,
    is_hidden: false,
    daily_limit: i === 0 ? 12 : i === 5 ? 6 : null,
    created_at: now,
    updated_at: now,
  }))
  dishes.push(
    {
      ...dishes[9],
      id: 'dish-cake',
      name: 'Торт «Медовик»',
      photo_urls: [demoPhoto('#c98a3e', '#fbeed3', 6), demoPhoto('#a8642a', '#fff3dc', 4), demoPhoto('#e0a95a', '#f8e6c4', 8)],
      category: 'Десерти',
      description: 'Цілий медовий торт зі сметанним кремом, 8 шматків. Печу за день до видачі.',
      weight_g: 1200,
      volume_ml: null,
      portion_note: 'цілий торт, 8 шматків',
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
      ingredients: ['борошно', 'мед', 'яйця', 'цукор', 'сметана', 'вершкове масло', 'сода'],
      allergens: ['gluten', 'eggs', 'milk'],
      tags: ['vegetarian'],
      price_cents: 2800,
      slots: ['breakfast', 'lunch', 'dinner'],
      unit: 'piece',
      lead_days: 1,
      daily_limit: 3,
      sort_order: 20,
    },
    {
      ...dishes[3],
      id: 'dish-m1',
      chef_id: PENDING_CHEF,
      name: 'Плов з куркою',
      category: 'Другі страви',
      description: 'Рис з куркою, морквою і спеціями.',
      allergens: [],
      ingredients: ['рис', 'курка', 'морква', 'цибуля', 'часник', 'зіра'],
      price_cents: 750,
      sort_order: 0,
    },
  )

  const d = (n: number) => dishes[n - 1]
  let orderNo = 0
  const orders: Row[] = []
  const items: Row[] = []
  const reviews: Row[] = []

  const addOrder = (o: Row, lines: [Row, number][]) => {
    const id = `order-${++orderNo}`
    orders.push({
      id,
      number: orderNo,
      checkout_id: id,
      chef_id: DEMO_USERS.chef,
      phone: null,
      comment: null,
      fulfillment: 'delivery',
      payment_method: 'cash',
      paid: o.status === 'delivered',
      platform_fee_percent: 10,
      created_at: now,
      total_cents: lines.reduce((s, [dish, q]) => s + dish.price_cents * q, 0),
      ...o,
    })
    lines.forEach(([dish, qty], i) =>
      items.push({ id: `${id}-item-${i}`, order_id: id, dish_id: dish.id, dish_name: dish.name, price_cents: dish.price_cents, qty, unit: dish.unit ?? 'portion' }),
    )
    return id
  }

  // Минулі видані замовлення інших сусідів з відгуками.
  const past = [
    { name: 'Ірина', apt: '5', dish: 1, rating: 5, text: 'Борщ як у мами, пампушки ще теплі!' },
    { name: 'Андрій', apt: '9', dish: 5, rating: 4, text: 'Деруни смачні, сметани можна більше.' },
    { name: 'Ірина', apt: '5', dish: 2, rating: 5, text: null },
    { name: 'Марія', apt: '2', dish: 1, rating: 5, text: 'Замовлятиму щотижня.' },
  ]
  past.forEach((p, i) => {
    const id = addOrder(
      { customer_id: `neighbour-${i}`, apartment: p.apt, customer_name: p.name, delivery_date: addDays(today, -2 - i), slot: 'lunch', status: 'delivered' },
      [[d(p.dish), 1]],
    )
    reviews.push({
      id: `review-${i}`,
      order_item_id: `${id}-item-0`,
      dish_id: d(p.dish).id,
      chef_id: DEMO_USERS.chef,
      customer_id: `neighbour-${i}`,
      author_name: p.name,
      rating: p.rating,
      body: p.text,
      chef_reply: i === 0 ? 'Дякую, Ірино! Чекаю знову 🙂' : null,
      is_hidden: false,
      created_at: new Date(Date.now() - (i + 2) * 86400000).toISOString(),
    })
  })

  // Замовлення демо-клієнта: вчорашнє видане (можна оцінити) і завтрашнє нове.
  addOrder(
    { customer_id: DEMO_USERS.customer, apartment: '12', customer_name: 'Іван Петренко', phone: '+34 600 123 456', delivery_date: yesterday, slot: 'dinner', status: 'delivered' },
    [
      [d(6), 1],
      [d(10), 2],
    ],
  )
  addOrder(
    { customer_id: DEMO_USERS.customer, apartment: '12', customer_name: 'Іван Петренко', phone: '+34 600 123 456', delivery_date: tomorrow, slot: 'lunch', status: 'new', comment: 'Без цибулі, будь ласка' },
    [
      [d(1), 2],
      [d(2), 1],
    ],
  )

  const cake = dishes.find((x) => x.id === 'dish-cake')!
  addOrder(
    { customer_id: 'neighbour-e', apartment: '8', customer_name: 'Тетяна', phone: '+34 633 777 888', delivery_date: tomorrow, slot: 'dinner', status: 'accepted', comment: 'Напис «З днем народження, Марко»' },
    [[cake, 1]],
  )
  addOrder(
    { customer_id: 'neighbour-f', apartment: '3', customer_name: 'Петро', delivery_date: tomorrow, slot: 'lunch', status: 'accepted' },
    [
      [d(1), 1],
      [cake, 1],
    ],
  )

  // Сьогоднішні замовлення для кухні.
  addOrder(
    { customer_id: 'neighbour-a', apartment: '7', customer_name: 'Оля', phone: '+34 611 222 333', delivery_date: today, slot: 'breakfast', status: 'delivered' },
    [[d(7), 2]],
  )
  addOrder(
    { customer_id: 'neighbour-b', apartment: '3', customer_name: 'Петро', delivery_date: today, slot: 'lunch', status: 'cooking', comment: 'Подзвоніть у двері' },
    [
      [d(1), 1],
      [d(4), 1],
    ],
  )
  addOrder(
    { customer_id: 'neighbour-c', apartment: '14', customer_name: 'Наталя', delivery_date: today, slot: 'lunch', status: 'accepted' },
    [
      [d(1), 2],
      [d(10), 2],
    ],
  )
  addOrder(
    { customer_id: 'neighbour-d', apartment: '1', customer_name: 'Сергій', phone: '+34 622 444 555', delivery_date: today, slot: 'dinner', status: 'new', fulfillment: 'pickup' },
    [[d(6), 1]],
  )

  return {
    settings: [{ id: 1, ...DEFAULT_SETTINGS }],
    profiles: [
      { id: DEMO_USERS.customer, full_name: 'Іван Петренко', phone: '+34 600 123 456', apartment: '12', role: 'customer', telegram_id: null },
      { id: DEMO_USERS.chef, full_name: 'Оксана', phone: '+34 600 987 654', apartment: '4', role: 'chef', telegram_id: null },
      { id: DEMO_USERS.admin, full_name: 'Костянтин', role: 'admin', telegram_id: null },
      { id: PENDING_CHEF, full_name: 'Марко', role: 'chef', telegram_id: null },
    ],
    chefs: [
      { id: DEMO_USERS.chef, display_name: 'Кухня Оксани', bio: 'Готую українські страви вдома, як для своєї родини.', phone: '+34 600 987 654', photo_url: null, status: 'approved', created_at: now },
      { id: PENDING_CHEF, display_name: 'Плов від Марка', bio: 'Узбецька кухня, плов на замовлення.', phone: '+34 633 000 111', photo_url: null, status: 'pending', created_at: now },
    ],
    chef_telegram: [
      { chef_id: DEMO_USERS.chef, chat_id: 1, link_token: 'demo-token-1' },
      { chef_id: PENDING_CHEF, chat_id: null, link_token: 'demo-token-2' },
    ],
    dishes,
    orders,
    order_items: items,
    reviews,
    counters: { order: orderNo },
    builtOn: today,
  }
}
