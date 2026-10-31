import { confirmAction } from '../../lib/confirm'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { STATUS_LABELS, money, stars } from '../../lib/format'
import { errorText, supabase } from '../../lib/supabase'
import { SLOTS, addDays, dateLabel, todayIn } from '../../lib/time'
import { useAuth } from '../../state/auth'
import { useSettings } from '../../state/settings'
import type { Chef, ChefStatus, Order, Profile, Review, Settings } from '../../types'

type Tab = 'chefs' | 'people' | 'orders' | 'report' | 'reviews' | 'settings'
const TABS: [Tab, string][] = [
  ['chefs', 'Кухарі'],
  ['people', 'Люди'],
  ['orders', 'Замовлення'],
  ['report', 'Звіт'],
  ['reviews', 'Відгуки'],
  ['settings', 'Налаштування'],
]

export default function Admin() {
  const { isAdmin, loading } = useAuth()
  const [tab, setTab] = useState<Tab>('chefs')

  if (loading) return <div className="page muted">Завантаження…</div>
  if (!isAdmin) {
    return (
      <div className="page center">
        <p>Ця сторінка лише для адміністратора.</p>
        <Link to="/">До меню</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Адмінка</h1>
      <div className="tabs small scroll-x">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'chefs' && <ChefsTab />}
      {tab === 'people' && <PeopleTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'report' && <ReportTab />}
      {tab === 'reviews' && <ReviewsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}

const ROLE_LABELS: Record<Profile['role'], string> = { customer: 'клієнт', chef: 'кухар', admin: 'адміністратор' }

/** Користувачі: тут адміністратор призначає інших адміністраторів без зміни налаштувань сервера. */
function PeopleTab() {
  const { session } = useAuth()
  const [people, setPeople] = useState<Profile[]>([])
  const [chefIds, setChefIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('chefs').select('id'),
    ])
    if (p.error) setError(errorText(p.error))
    setPeople((p.data as Profile[]) ?? [])
    setChefIds(new Set(((c.data as { id: string }[]) ?? []).map((x) => x.id)))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setAdmin = async (p: Profile, admin: boolean) => {
    const name = p.full_name || (p.telegram_username ? '@' + p.telegram_username : 'користувача')
    if (!confirmAction(admin ? `Зробити ${name} адміністратором?` : `Забрати в ${name} права адміністратора?`)) return
    const role = admin ? 'admin' : chefIds.has(p.id) ? 'chef' : 'customer'
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    if (error) setError(errorText(error))
    void load()
  }

  const q = query.trim().toLowerCase().replace(/^@/, '')
  const shown = people
    .filter((p) => !q || [p.full_name, p.telegram_username, p.phone, p.telegram_id?.toString()].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin'))

  return (
    <div>
      <p className="small muted">
        Адміністратор бачить «Адмінку» на сайті і в Telegram. Людина зʼявиться тут після першого входу в застосунок.
      </p>
      <input placeholder="Пошук: імʼя, @username, телефон" value={query} onChange={(e) => setQuery(e.target.value)} />
      {error && <p className="error">{error}</p>}
      {shown.map((p) => (
        <div key={p.id} className="card row">
          <div className="grow">
            <b>{p.full_name || 'Без імені'}</b>
            <div className="small muted">
              {[p.telegram_username && '@' + p.telegram_username, p.telegram_id ? 'Telegram' : 'пошта', ROLE_LABELS[p.role]]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {p.role === 'admin' ? (
            p.id !== session?.user.id && (
              <button className="btn small ghost" onClick={() => setAdmin(p, false)}>
                Забрати права
              </button>
            )
          ) : (
            <button className="btn small" onClick={() => setAdmin(p, true)}>
              Зробити адміном
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

const CHEF_STATUS: Record<ChefStatus, string> = {
  pending: 'чекає схвалення',
  approved: 'схвалений',
  rejected: 'відхилений',
  suspended: 'призупинений',
}

function ChefsTab() {
  const [chefs, setChefs] = useState<Chef[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('chefs').select('*').order('created_at', { ascending: false })
    const list = (data as Chef[]) ?? []
    setChefs([...list.filter((c) => c.status === 'pending'), ...list.filter((c) => c.status !== 'pending')])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setStatus = async (c: Chef, status: ChefStatus) => {
    const { error } = await supabase.from('chefs').update({ status }).eq('id', c.id)
    if (error) setError(errorText(error))
    void load()
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {chefs.length === 0 && <p className="muted">Кухарів ще немає. Посилання для реєстрації: розділ «Кухня» в застосунку.</p>}
      {chefs.map((c) => (
        <div key={c.id} className="card">
          <div className="row">
            <b>{c.display_name}</b>
            <span className={`status chef-${c.status}`}>{CHEF_STATUS[c.status]}</span>
          </div>
          {c.phone && <div className="small">{c.phone}</div>}
          {c.bio && <p className="small">{c.bio}</p>}
          <div className="actions">
            {c.status !== 'approved' && (
              <button className="btn small" onClick={() => setStatus(c, 'approved')}>
                Схвалити
              </button>
            )}
            {c.status === 'pending' && (
              <button className="btn small ghost" onClick={() => setStatus(c, 'rejected')}>
                Відхилити
              </button>
            )}
            {c.status === 'approved' && (
              <button className="btn small ghost" onClick={() => setStatus(c, 'suspended')}>
                Призупинити
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function OrdersTab() {
  const { settings } = useSettings()
  const today = todayIn(settings.timezone)
  const [date, setDate] = useState(today)
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, order_items(*), chefs(display_name)')
      .eq('delivery_date', date)
      .order('slot')
      .order('created_at')
      .then(({ data }) => setOrders((data as Order[]) ?? []))
  }, [date])

  return (
    <div>
      <div className="row">
        <button className="btn small ghost" onClick={() => setDate(addDays(date, -1))}>
          ←
        </button>
        <b>{dateLabel(date, settings.timezone)}</b>
        <button className="btn small ghost" onClick={() => setDate(addDays(date, 1))}>
          →
        </button>
      </div>
      {orders.length === 0 && <p className="muted">Замовлень немає.</p>}
      {orders.map((o) => (
        <div key={o.id} className={`card ${o.status === 'cancelled' ? 'dim' : ''}`}>
          <div className="row">
            <b>
              №{o.number} · {settings.slots[o.slot].label} · кв. {o.apartment}
            </b>
            <span className={`status status-${o.status}`}>{STATUS_LABELS[o.status]}</span>
          </div>
          <div className="small muted">
            кухар {o.chefs?.display_name} · {o.customer_name} {o.phone}
          </div>
          <div className="small">{o.order_items.map((i) => `${i.dish_name} × ${i.qty}`).join(', ')}</div>
          <b>{money(o.total_cents)}</b>
        </div>
      ))}
    </div>
  )
}

function ReportTab() {
  const { settings } = useSettings()
  const [month, setMonth] = useState(todayIn(settings.timezone).slice(0, 7))
  const [rows, setRows] = useState<{ chef_id: string; display_name: string; orders_count: number; revenue_cents: number; fee_cents: number }[]>([])

  useEffect(() => {
    supabase.rpc('sales_report', { p_month: `${month}-01` }).then(({ data }) => setRows(data ?? []))
  }, [month])

  return (
    <div>
      <label>
        Місяць <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </label>
      <p className="small muted">Рахуються лише видані замовлення. Відсоток платформи береться той, що діяв у момент замовлення.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Кухар</th>
            <th>Замовлень</th>
            <th>Виручка</th>
            <th>Відсоток</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.chef_id}>
              <td>{r.display_name}</td>
              <td>{r.orders_count}</td>
              <td>{money(r.revenue_cents)}</td>
              <td>{money(r.fee_cents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Разом</th>
            <th>{rows.reduce((s, r) => s + r.orders_count, 0)}</th>
            <th>{money(rows.reduce((s, r) => s + r.revenue_cents, 0))}</th>
            <th>{money(rows.reduce((s, r) => s + r.fee_cents, 0))}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function ReviewsTab() {
  const [reviews, setReviews] = useState<Review[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('reviews').select('*, dishes(name)').order('created_at', { ascending: false }).limit(100)
    setReviews((data as Review[]) ?? [])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (r: Review) => {
    await supabase.from('reviews').update({ is_hidden: !r.is_hidden }).eq('id', r.id)
    void load()
  }

  return (
    <div>
      {reviews.length === 0 && <p className="muted">Відгуків ще немає.</p>}
      {reviews.map((r) => (
        <div key={r.id} className={`card ${r.is_hidden ? 'dim' : ''}`}>
          <div className="row">
            <span>
              <span className="rating">{stars(r.rating)}</span> <b>{r.dishes?.name}</b> <span className="small muted">{r.author_name}</span>
            </span>
            <button className="btn small ghost" onClick={() => toggle(r)}>
              {r.is_hidden ? 'Показати' : 'Приховати'}
            </button>
          </div>
          {r.body && <p>{r.body}</p>}
        </div>
      ))}
    </div>
  )
}

function SettingsTab() {
  const { settings, reload } = useSettings()
  const [draft, setDraft] = useState<Settings>(settings)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => setDraft(settings), [settings])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase
      .from('settings')
      .update({
        platform_fee_percent: draft.platform_fee_percent,
        max_days_ahead: draft.max_days_ahead,
        slots: draft.slots,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setMessage(error ? errorText(error) : 'Збережено')
    await reload()
  }

  return (
    <form className="form" onSubmit={save}>
      <div className="grid2">
        <label>
          Відсоток платформи, %
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={draft.platform_fee_percent}
            onChange={(e) => setDraft({ ...draft, platform_fee_percent: Number(e.target.value) })}
          />
        </label>
        <label>
          Замовлення наперед, днів
          <input
            type="number"
            min={0}
            max={30}
            value={draft.max_days_ahead}
            onChange={(e) => setDraft({ ...draft, max_days_ahead: Number(e.target.value) })}
          />
        </label>
      </div>
      {SLOTS.map((slot) => {
        const s = draft.slots[slot]
        const upd = (patch: Partial<typeof s>) => setDraft({ ...draft, slots: { ...draft.slots, [slot]: { ...s, ...patch } } })
        return (
          <fieldset key={slot}>
            <legend>
              <label className="check inline">
                <input type="checkbox" checked={s.enabled} onChange={(e) => upd({ enabled: e.target.checked })} />
                <span>{s.label}</span>
              </label>
            </legend>
            <div className="grid4">
              <label>
                Видача з
                <input type="time" value={s.window_start} onChange={(e) => upd({ window_start: e.target.value })} />
              </label>
              <label>
                до
                <input type="time" value={s.window_end} onChange={(e) => upd({ window_end: e.target.value })} />
              </label>
              <label>
                Замовити до
                <input type="time" value={s.cutoff_time} onChange={(e) => upd({ cutoff_time: e.target.value })} />
              </label>
              <label>
                День дедлайну
                <select value={s.cutoff_days_before} onChange={(e) => upd({ cutoff_days_before: Number(e.target.value) })}>
                  <option value={0}>того ж дня</option>
                  <option value={1}>напередодні</option>
                  <option value={2}>за 2 дні</option>
                </select>
              </label>
            </div>
          </fieldset>
        )
      })}
      {message && <p className="notice">{message}</p>}
      <button className="btn">Зберегти налаштування</button>
    </form>
  )
}
