import { useEffect, useState, type FormEvent } from 'react'
import { money } from '../../lib/format'
import { errorText, supabase } from '../../lib/supabase'
import { botUsername } from '../../lib/telegram'
import { todayIn } from '../../lib/time'
import { useAuth } from '../../state/auth'
import ShareChef from '../../components/ShareChef'
import { SLUG_RE, slugify } from '../../lib/share'
import { Link } from 'react-router-dom'
import { useSettings } from '../../state/settings'

interface ChefTelegram {
  chat_id: number | null
  link_token: string
}

interface Sales {
  orders_count: number
  revenue_cents: number
  fee_cents: number
}

export default function KitchenProfile() {
  const { chef, reload, signOut } = useAuth()
  const { settings } = useSettings()
  const [name, setName] = useState(chef?.display_name ?? '')
  const [bio, setBio] = useState(chef?.bio ?? '')
  const [phone, setPhone] = useState(chef?.phone ?? '')
  const [slug, setSlug] = useState(chef?.slug ?? '')
  const [telegram, setTelegram] = useState<ChefTelegram | null>(null)
  const [sales, setSales] = useState<Sales | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!chef) return
    supabase
      .from('chef_telegram')
      .select('chat_id, link_token')
      .eq('chef_id', chef.id)
      .maybeSingle()
      .then(({ data }) => setTelegram(data as ChefTelegram | null))
    supabase.rpc('sales_report', { p_month: todayIn(settings.timezone) }).then(({ data }) => {
      const mine = ((data as (Sales & { chef_id: string })[]) ?? []).find((r) => r.chef_id === chef.id)
      setSales(mine ?? null)
    })
  }, [chef, settings.timezone])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const cleanSlug = slugify(slug)
    if (!SLUG_RE.test(cleanSlug)) return setMessage('Адреса сторінки: від 3 латинських літер або цифр, можна дефіс')
    setSlug(cleanSlug)
    const { error } = await supabase
      .from('chefs')
      .update({ display_name: name, bio: bio || null, phone: phone || null, slug: cleanSlug })
      .eq('id', chef!.id)
    const taken = error && /chefs_slug_key|duplicate/i.test(error.message)
    setMessage(taken ? 'Така адреса вже зайнята, спробуйте іншу' : error ? errorText(error) : 'Збережено')
    await reload()
  }

  const link = telegram && botUsername ? `https://t.me/${botUsername}?start=chef_${telegram.link_token}` : null

  return (
    <div>
      <div className="card">
        <h3>Продажі цього місяця</h3>
        <p>
          Видано замовлень: <b>{sales?.orders_count ?? 0}</b>
          <br />
          Виручка: <b>{money(sales?.revenue_cents ?? 0)}</b>
          <br />
          Відсоток платформи ({settings.platform_fee_percent}%): <b>{money(sales?.fee_cents ?? 0)}</b>
        </p>
      </div>

      {chef && (
        <div className="card">
          <h3>Ваша сторінка</h3>
          <p className="small muted">
            Тут лише ваші страви, з неї одразу можна замовити. Надішліть посилання сусідам, у чат будинку чи в Instagram.{' '}
            <Link to={`/chef/${chef.slug}`}>Відкрити сторінку</Link>
          </p>
          <ShareChef chef={chef} />
        </div>
      )}

      <div className="card">
        <h3>Сповіщення в Telegram</h3>
        {telegram?.chat_id ? (
          <p>✅ Підключено. Нові замовлення приходять вам у Telegram.</p>
        ) : link ? (
          <>
            <p>Натисніть кнопку, відкриється бот. Натисніть у ньому «Start», і замовлення почнуть приходити вам.</p>
            <a className="btn" href={link} target="_blank" rel="noreferrer">
              Підключити Telegram
            </a>
          </>
        ) : (
          <p className="muted">Бот ще не налаштований адміністратором.</p>
        )}
      </div>

      <form className="form card" onSubmit={save}>
        <h3>Профіль</h3>
        <label>
          Імʼя в меню
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Адреса сторінки
          <div className="slug-input">
            <span className="muted">/chef/</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} onBlur={() => setSlug((v) => slugify(v) || v)} />
          </div>
          {chef && slug === chef.slug && /^chef-[0-9a-f]{8}$/.test(slug) && (
            <button type="button" className="link small" onClick={() => setSlug(slugify(name))}>
              Зробити з імені: /chef/{slugify(name)}
            </button>
          )}
        </label>
        <label>
          Телефон
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
        </label>
        <label>
          Про себе
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
        </label>
        {message && <p className="notice">{message}</p>}
        <button className="btn">Зберегти</button>
      </form>
      <button className="btn ghost" onClick={signOut}>
        Вийти з акаунта
      </button>
    </div>
  )
}
