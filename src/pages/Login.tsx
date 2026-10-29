import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { errorText, supabase } from '../lib/supabase'
import { botUsername, inTelegram } from '../lib/telegram'
import { useAuth } from '../state/auth'

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void
  }
}

export default function Login() {
  const { session, telegramError, signInWithTelegramWidget, loading } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (inTelegram || !botUsername || !widgetRef.current) return
    window.onTelegramAuth = (user) => {
      signInWithTelegramWidget(user).catch((e) => setError(errorText(e)))
    }
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.dataset.telegramLogin = botUsername
    script.dataset.size = 'large'
    script.dataset.radius = '10'
    script.dataset.onauth = 'onTelegramAuth(user)'
    script.dataset.requestAccess = 'write'
    widgetRef.current.innerHTML = ''
    widgetRef.current.appendChild(script)
  }, [signInWithTelegramWidget])

  if (session) return <Navigate to={next} replace />
  if (loading) return <div className="page muted">Вхід…</div>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message === 'Invalid login credentials' ? 'Неправильна пошта або пароль' : errorText(error))
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
      if (error) setError(errorText(error))
      else if (!data.session) setMessage('Ми надіслали лист для підтвердження пошти. Перейдіть за посиланням і поверніться сюди.')
    }
    setBusy(false)
  }

  return (
    <div className="page narrow">
      <h1>Вхід</h1>
      {inTelegram && telegramError && <p className="error">Не вдалося увійти через Telegram: {telegramError}</p>}

      {!inTelegram && botUsername && (
        <div className="card center">
          <p>Найпростіше — через Telegram:</p>
          <div ref={widgetRef} />
        </div>
      )}

      <form className="form card" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
            Увійти
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Зареєструватися
          </button>
        </div>
        {mode === 'signup' && (
          <label>
            Імʼя
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          Пошта
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="notice">{message}</p>}
        <button className="btn wide" disabled={busy}>
          {mode === 'signin' ? 'Увійти' : 'Створити акаунт'}
        </button>
      </form>
    </div>
  )
}
