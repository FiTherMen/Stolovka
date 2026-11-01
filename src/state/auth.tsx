import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { errorText, isConfigured, supabase } from '../lib/supabase'
import { inTelegram, tg } from '../lib/telegram'
import type { Chef, Profile } from '../types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  chef: Chef | null
  loading: boolean
  telegramError: string | null
  isAdmin: boolean
  reload: () => Promise<void>
  signOut: () => Promise<void>
  signInWithTelegramWidget: (data: Record<string, string | number>) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Обмінює підписані Telegram дані на сесію Supabase через серверну функцію. */
async function exchangeTelegram(body: object) {
  const res = await fetch('/api/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string }
  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new Error(json.error || `Вхід через Telegram не вдався (${res.status})`)
  }
  const { error } = await supabase.auth.setSession({ access_token: json.access_token, refresh_token: json.refresh_token })
  if (error) throw error
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [chef, setChef] = useState<Chef | null>(null)
  const [loading, setLoading] = useState(true)
  const [telegramError, setTelegramError] = useState<string | null>(null)

  const loadUser = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setChef(null)
      return
    }
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('chefs').select('*').eq('id', s.user.id).maybeSingle(),
    ])
    setProfile((p as Profile) ?? null)
    setChef((c as Chef) ?? null)
  }, [])

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      let s = data.session
      // У Telegram завжди входимо під акаунтом того, хто відкрив Mini App.
      const tgUserId = tg?.initDataUnsafe.user?.id
      const sessionTgId = s?.user.user_metadata?.telegram_id
      if (inTelegram && tgUserId && (!s || Number(sessionTgId) !== tgUserId)) {
        try {
          await exchangeTelegram({ initData: tg!.initData })
          s = (await supabase.auth.getSession()).data.session
        } catch (e) {
          setTelegramError(errorText(e))
        }
      }
      if (cancelled) return
      setSession(s)
      await loadUser(s)
      if (!cancelled) setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Запити до бази не можна робити прямо всередині цього колбека (supabase-js може заблокуватися).
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => void loadUser(s), 0)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [loadUser])

  const value: AuthState = {
    session,
    profile,
    chef,
    loading,
    telegramError,
    isAdmin: profile?.role === 'admin',
    reload: () => loadUser(session),
    signOut: async () => {
      await supabase.auth.signOut()
    },
    signInWithTelegramWidget: async (data) => {
      await exchangeTelegram({ widget: data })
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
