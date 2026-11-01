import { useState, type FormEvent } from 'react'
import { errorText, supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth'

export default function ChefRegister() {
  const { session, profile, reload } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('chefs').insert({ id: session!.user.id, display_name: name, bio: bio || null, phone: phone || null })
    setBusy(false)
    if (error) setError(errorText(error))
    else await reload()
  }

  return (
    <div className="page narrow">
      <h1>Стати кухарем</h1>
      <p>
        Заповніть коротку анкету. Після схвалення адміністратором ваші страви зʼявляться в меню, а нові замовлення приходитимуть вам у
        Telegram.
      </p>
      <form className="form card" onSubmit={submit}>
        <label>
          Як вас підписати в меню
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="напр. Кухня Оксани" />
        </label>
        <label>
          Телефон
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
        </label>
        <label>
          Кілька слів про себе і вашу кухню
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
        </label>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>Я відповідаю за якість, склад і алергени своїх страв і вказуватиму їх чесно.</span>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn wide" disabled={busy}>
          Надіслати заявку
        </button>
      </form>
    </div>
  )
}
