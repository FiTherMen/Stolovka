/**
 * Демо-замінник клієнта Supabase: зберігає дані в памʼяті браузера (і в localStorage),
 * підтримує лише ті запити, які робить застосунок. Логіка RPC повторює функції з міграції.
 */
import { DEFAULT_SETTINGS, isSlotOpen, todayIn } from '../lib/time'
import type { Settings, Slot } from '../types'
import { DEMO_USERS, buildDemoDb, type DemoDb, type Row } from './demoData'

const KEY = 'stolovka.demo.v1'
type Result = { data: unknown; error: { message: string } | null; count?: number }

let db: DemoDb = load()

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY)
    const saved = raw ? (JSON.parse(raw) as DemoDb) : null
    // Дані прив'язані до дат, тому наступного дня демо починається заново.
    if (saved && saved.builtOn === todayIn(DEFAULT_SETTINGS.timezone)) return saved
  } catch {
    /* немає доступу до сховища */
  }
  return buildDemoDb()
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* сховище недоступне або переповнене: дані лишаються до перезавантаження */
  }
}

export function resetDemo() {
  db = buildDemoDb()
  save()
}

const uid = () => crypto.randomUUID()
const settings = (): Settings => ({ ...DEFAULT_SETTINGS, ...(db.settings[0] as unknown as Settings) })

// ───────── зв'язки між таблицями для select('*, chefs(...)') ─────────

const SINGULAR: Record<string, string> = { chefs: 'chef', dishes: 'dish', orders: 'order', order_items: 'order_item', profiles: 'profile' }

function computedTable(name: string): Row[] {
  if (name === 'dish_ratings' || name === 'chef_ratings') {
    const key = name === 'dish_ratings' ? 'dish_id' : 'chef_id'
    const groups = new Map<string, number[]>()
    db.reviews.filter((r) => !r.is_hidden).forEach((r) => groups.set(r[key] as string, [...(groups.get(r[key] as string) ?? []), r.rating as number]))
    return [...groups.entries()].map(([id, list]) => ({
      [key]: id,
      avg_rating: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10,
      reviews_count: list.length,
    }))
  }
  return (db as unknown as Record<string, Row[]>)[name] ?? []
}

interface Embed {
  name: string
  inner: boolean
}

function parseSelect(sel: string): Embed[] {
  const embeds: Embed[] = []
  const re = /(\w+)(!inner)?\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(sel))) embeds.push({ name: m[1], inner: Boolean(m[2]) })
  return embeds
}

function attach(table: string, row: Row, embed: Embed): Row {
  const target = computedTable(embed.name)
  const fk = `${SINGULAR[embed.name]}_id`
  if (fk in row) return { ...row, [embed.name]: target.find((t) => t.id === row[fk]) ?? null }
  const back = `${SINGULAR[table]}_id`
  return { ...row, [embed.name]: target.filter((t) => t[back] === row.id) }
}

// ───────── конструктор запитів ─────────

type Filter = (row: Row) => boolean

class Query implements PromiseLike<Result> {
  private filters: Filter[] = []
  private orders: { col: string; asc: boolean }[] = []
  private max = Infinity
  private single = false
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] | null = null
  private selectStr = '*'
  private returning = false

  constructor(private table: string) {}

  select(sel = '*') {
    if (this.action === 'select') this.selectStr = sel
    else this.returning = true
    return this
  }
  insert(payload: Row | Row[]) {
    this.action = 'insert'
    this.payload = payload
    return this
  }
  update(payload: Row) {
    this.action = 'update'
    this.payload = payload
    return this
  }
  delete() {
    this.action = 'delete'
    return this
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => pick(r, col) === value)
    return this
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(pick(r, col)))
    return this
  }
  is(col: string, value: unknown) {
    this.filters.push((r) => (pick(r, col) ?? null) === value)
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending ?? true })
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, fail)
  }

  private run(): Result {
    const rows = (db as unknown as Record<string, Row[]>)[this.table]
    if (this.action === 'insert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => insertDefaults(this.table, r))
      for (const r of list) {
        const err = beforeInsert(this.table, r)
        if (err) return { data: null, error: { message: err } }
      }
      rows.push(...list)
      list.forEach((r) => afterInsert(this.table, r))
      save()
      return { data: this.returning ? list : null, error: null }
    }
    if (this.action === 'update') {
      const hit = rows.filter((r) => this.filters.every((f) => f(r)))
      for (const r of hit) {
        const err = beforeUpdate(this.table, r, this.payload as Row)
        if (err) return { data: null, error: { message: err } }
        Object.assign(r, this.payload, this.table === 'dishes' ? { updated_at: new Date().toISOString() } : {})
      }
      save()
      return { data: this.returning ? hit : null, error: null }
    }
    if (this.action === 'delete') {
      const keep = rows.filter((r) => !this.filters.every((f) => f(r)))
      ;(db as unknown as Record<string, Row[]>)[this.table] = keep
      save()
      return { data: null, error: null }
    }

    let list = computedTable(this.table).map((r) => ({ ...r }))
    const embeds = parseSelect(this.selectStr)
    for (const e of embeds) list = list.map((r) => attach(this.table, r, e))
    list = list.filter((r) => this.filters.every((f) => f(r)))
    for (const e of embeds) if (e.inner) list = list.filter((r) => r[e.name] != null)
    for (const o of [...this.orders].reverse()) {
      list.sort((a, b) => {
        const x = a[o.col] as string | number
        const y = b[o.col] as string | number
        return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1)
      })
    }
    list = list.slice(0, this.max)
    return { data: this.single ? (list[0] ?? null) : list, error: null }
  }
}

function pick(row: Row, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Row)[k] : undefined), row)
}

function insertDefaults(table: string, r: Row): Row {
  const now = new Date().toISOString()
  if (table === 'dishes') {
    return { id: uid(), photo_urls: [], ingredients: [], allergens: [], tags: [], is_active: true, is_hidden: false, sort_order: 0, daily_limit: null, created_at: now, updated_at: now, ...r }
  }
  if (table === 'chefs') return { bio: null, photo_url: null, phone: null, created_at: now, ...r, status: currentRole() === 'admin' ? (r.status ?? 'pending') : 'pending' }
  return { id: uid(), created_at: now, ...r }
}

function beforeInsert(table: string, r: Row): string | null {
  if (table === 'chefs' && db.chefs.some((c) => c.id === r.id)) return 'Ви вже зареєстровані як кухар'
  if (table === 'dishes' && r.chef_id !== session?.user.id) return 'Можна додавати лише свої страви'
  return null
}

function afterInsert(table: string, r: Row) {
  if (table === 'chefs') {
    db.chef_telegram.push({ chef_id: r.id, chat_id: null, link_token: uid() })
    const p = db.profiles.find((x) => x.id === r.id)
    if (p && p.role === 'customer') p.role = 'chef'
  }
}

function beforeUpdate(table: string, row: Row, patch: Row): string | null {
  if (table === 'chefs' && 'status' in patch && patch.status !== row.status && currentRole() !== 'admin') {
    return 'Лише адміністратор може змінювати статус кухаря'
  }
  return null
}

// ───────── RPC (як у supabase/migrations/0001_init.sql) ─────────

const fail = (message: string): Result => ({ data: null, error: { message } })

function dishSold(dishId: string, date: string) {
  return db.order_items
    .filter((i) => i.dish_id === dishId)
    .filter((i) => {
      const o = db.orders.find((x) => x.id === i.order_id)
      return o && o.delivery_date === date && o.status !== 'cancelled'
    })
    .reduce((s, i) => s + (i.qty as number), 0)
}

const RPC: Record<string, (args: Row) => Result> = {
  dishes_left: ({ p_date }) => ({
    data: db.dishes
      .filter((d) => d.daily_limit != null && d.is_active)
      .map((d) => ({ dish_id: d.id, left_count: Math.max((d.daily_limit as number) - dishSold(d.id as string, p_date as string), 0) })),
    error: null,
  }),

  place_order: (a) => {
    const me = session?.user.id
    if (!me) return fail('Потрібно увійти, щоб оформити замовлення')
    if (!String(a.p_customer_name ?? '').trim() || !String(a.p_apartment ?? '').trim()) return fail('Вкажіть імʼя та номер квартири')
    const items = (a.p_items as { dish_id: string; qty: number }[]) ?? []
    if (!items.length) return fail('Кошик порожній')
    const s = settings()
    const date = a.p_date as string
    const slot = a.p_slot as Slot
    if (!isSlotOpen(s, date, slot)) return fail('Замовлення на це вікно вже закрите')
    const cart: { dish: Row; qty: number }[] = []
    for (const it of items) {
      const dish = db.dishes.find((d) => d.id === it.dish_id)
      const chef = dish && db.chefs.find((c) => c.id === dish.chef_id)
      if (!dish || !dish.is_active || dish.is_hidden || chef?.status !== 'approved') return fail('Страва недоступна, оновіть меню')
      if (!(dish.slots as Slot[]).includes(slot)) return fail(`Страву «${dish.name}» не готують на це вікно`)
      if (dish.daily_limit != null && dishSold(dish.id as string, date) + it.qty > (dish.daily_limit as number)) {
        return fail(`Страви «${dish.name}» на цей день лишилось ${Math.max((dish.daily_limit as number) - dishSold(dish.id as string, date), 0)}`)
      }
      cart.push({ dish, qty: it.qty })
    }
    const checkout = uid()
    const ids: string[] = []
    for (const chefId of new Set(cart.map((c) => c.dish.chef_id as string))) {
      const mine = cart.filter((c) => c.dish.chef_id === chefId)
      const id = uid()
      db.orders.push({
        id,
        number: ++db.counters.order,
        checkout_id: checkout,
        customer_id: me,
        chef_id: chefId,
        apartment: String(a.p_apartment).trim(),
        customer_name: String(a.p_customer_name).trim(),
        phone: (a.p_phone as string) || null,
        comment: (a.p_comment as string) || null,
        delivery_date: date,
        slot,
        fulfillment: a.p_fulfillment ?? 'delivery',
        status: 'new',
        payment_method: 'cash',
        paid: false,
        total_cents: mine.reduce((sum, c) => sum + (c.dish.price_cents as number) * c.qty, 0),
        platform_fee_percent: s.platform_fee_percent,
        created_at: new Date().toISOString(),
      })
      mine.forEach((c) =>
        db.order_items.push({ id: uid(), order_id: id, dish_id: c.dish.id, dish_name: c.dish.name, price_cents: c.dish.price_cents, qty: c.qty }),
      )
      ids.push(id)
    }
    const p = db.profiles.find((x) => x.id === me)
    if (p) Object.assign(p, { full_name: a.p_customer_name, phone: a.p_phone || p.phone, apartment: a.p_apartment })
    save()
    return { data: ids, error: null }
  },

  set_order_status: ({ p_order_id, p_status, p_paid }) => {
    const o = db.orders.find((x) => x.id === p_order_id)
    if (!o || (o.chef_id !== session?.user.id && currentRole() !== 'admin')) return fail('Замовлення не знайдено')
    o.status = p_status
    if (p_paid != null) o.paid = p_paid
    save()
    return { data: o, error: null }
  },

  cancel_my_order: ({ p_order_id }) => {
    const o = db.orders.find((x) => x.id === p_order_id && x.customer_id === session?.user.id)
    if (!o) return fail('Замовлення не знайдено')
    if (o.status !== 'new' || !isSlotOpen(settings(), o.delivery_date as string, o.slot as Slot)) return fail('Скасувати вже не можна, напишіть кухарю')
    o.status = 'cancelled'
    save()
    return { data: null, error: null }
  },

  leave_review: ({ p_order_item_id, p_rating, p_body }) => {
    const item = db.order_items.find((i) => i.id === p_order_item_id)
    const o = item && db.orders.find((x) => x.id === item.order_id)
    if (!item || !o || o.customer_id !== session?.user.id) return fail('Можна оцінити лише страву зі свого замовлення')
    if (o.status !== 'delivered') return fail('Оцінити можна після отримання замовлення')
    if (db.reviews.some((r) => r.order_item_id === item.id)) return fail('Ви вже оцінили цю страву')
    const review = {
      id: uid(),
      order_item_id: item.id,
      dish_id: item.dish_id,
      chef_id: o.chef_id,
      customer_id: o.customer_id,
      author_name: String(o.customer_name).split(' ')[0],
      rating: p_rating,
      body: p_body || null,
      chef_reply: null,
      is_hidden: false,
      created_at: new Date().toISOString(),
    }
    db.reviews.push(review)
    save()
    return { data: review, error: null }
  },

  reply_to_review: ({ p_review_id, p_reply }) => {
    const r = db.reviews.find((x) => x.id === p_review_id && (x.chef_id === session?.user.id || currentRole() === 'admin'))
    if (!r) return fail('Відгук не знайдено')
    r.chef_reply = String(p_reply ?? '').trim() || null
    save()
    return { data: null, error: null }
  },

  sales_report: ({ p_month }) => {
    const month = String(p_month).slice(0, 7)
    const isAdmin = currentRole() === 'admin'
    return {
      data: db.chefs
        .filter((c) => isAdmin || c.id === session?.user.id)
        .map((c) => {
          const list = db.orders.filter((o) => o.chef_id === c.id && o.status === 'delivered' && String(o.delivery_date).startsWith(month))
          return {
            chef_id: c.id,
            display_name: c.display_name,
            orders_count: list.length,
            revenue_cents: list.reduce((s, o) => s + (o.total_cents as number), 0),
            fee_cents: list.reduce((s, o) => s + Math.round(((o.total_cents as number) * (o.platform_fee_percent as number)) / 100), 0),
          }
        })
        .sort((a, b) => b.revenue_cents - a.revenue_cents),
      error: null,
    }
  },
}

// ───────── вхід ─────────

interface DemoSession {
  access_token: string
  refresh_token: string
  user: { id: string; user_metadata: Record<string, unknown> }
}

type Listener = (event: string, s: DemoSession | null) => void
const listeners = new Set<Listener>()
let session: DemoSession | null = null

function currentRole() {
  return db.profiles.find((p) => p.id === session?.user.id)?.role
}

export function demoSignIn(userId: string | null) {
  session = userId ? { access_token: 'demo', refresh_token: 'demo', user: { id: userId, user_metadata: {} } } : null
  try {
    if (userId) sessionStorage.setItem('stolovka.demo.user', userId)
    else sessionStorage.removeItem('stolovka.demo.user')
  } catch {
    /* без збереження між перезавантаженнями */
  }
  listeners.forEach((l) => l(userId ? 'SIGNED_IN' : 'SIGNED_OUT', session))
}

export function demoUserId() {
  return session?.user.id ?? null
}

// Демо стартує під клієнтом, щоб одразу можна було замовити.
{
  let saved: string | null = null
  try {
    saved = sessionStorage.getItem('stolovka.demo.user')
  } catch {
    /* сховище недоступне */
  }
  const id = saved || DEMO_USERS.customer
  session = { access_token: 'demo', refresh_token: 'demo', user: { id, user_metadata: {} } }
}

const photos = new Map<string, string>()

export function createDemoClient() {
  return {
    from: (table: string) => new Query(table),
    rpc: (name: string, args: Row = {}) => Promise.resolve(RPC[name] ? RPC[name](args) : fail(`Невідома функція ${name}`)),
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: (cb: Listener) => {
        listeners.add(cb)
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
      },
      signInWithPassword: async () => {
        demoSignIn(DEMO_USERS.customer)
        return { data: { session }, error: null }
      },
      signUp: async () => {
        demoSignIn(DEMO_USERS.customer)
        return { data: { session }, error: null }
      },
      signOut: async () => {
        demoSignIn(null)
        return { error: null }
      },
      setSession: async () => ({ data: { session }, error: null }),
    },
    storage: {
      from: () => ({
        upload: async (path: string, blob: Blob) => {
          const url = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.readAsDataURL(blob)
          })
          photos.set(path, url)
          return { data: { path }, error: null }
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: photos.get(path) ?? '' } }),
      }),
    },
  }
}

export const demoToday = () => todayIn(settings().timezone)
