import { isDemo } from './demo'
import { supabase } from './supabase'

/** Виклик серверної функції з токеном поточного користувача. Помилки сповіщень не блокують роботу. */
export async function callApi(path: string, body: unknown): Promise<boolean> {
  if (isDemo) return true
  try {
    const { data } = await supabase.auth.getSession()
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}
