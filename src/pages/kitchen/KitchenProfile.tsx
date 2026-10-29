import { useEffect, useState, type FormEvent } from 'react'
import { money } from '../../lib/format'
import { errorText, supabase } from '../../lib/supabase'
import { botUsername } from '../../lib/telegram'
import { todayIn } from '../../lib/time'
import { useAuth } from '../../state/auth'
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
    const { error } = await supabase.from('chefs').update({ display_name: name, bio: bio || null, phone: phone || null }).eq('id', chef!.id)
    setMessage(error ? errorText(error) : 'Збережено')
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
