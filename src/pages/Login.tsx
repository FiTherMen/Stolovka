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

  // Google не дозволяє вхід у вбудованому браузері Telegram, тому там кнопки немає.
  const signInWithGoogle = async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${next}` },
    })
    if (error) setError(errorText(error))
  }
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

      {!inTelegram && (
        <button type="button" className="btn wide google-btn" onClick={signInWithGoogle}>
          <GoogleIcon />
          Увійти через Google
        </button>
      )}

      <p className="divider">або поштою</p>

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

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
