import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createDemoClient } from '../demo/mockClient'
import { isDemo } from './demo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = isDemo || Boolean(url && anonKey)

export const supabase: SupabaseClient = isDemo
  ? (createDemoClient() as unknown as SupabaseClient)
  : createClient(url || 'http://localhost:54321', anonKey || 'missing-key', {
      auth: { persistSession: true, autoRefreshToken: true },
    })

/** Текст помилки Supabase/PostgREST для показу користувачу. */
export function errorText(e: unknown): string {
  if (!e) return 'Невідома помилка'
  if (typeof e === 'string') return e
  if (typeof e === 'object' && 'message' in e) return String((e as { message: string }).message)
  return 'Невідома помилка'
}
