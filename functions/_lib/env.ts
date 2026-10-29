import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Змінні середовища Cloudflare Pages (секрети задаються в налаштуваннях проєкту, див. README). */
export interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_SECRET: string
  ADMIN_TELEGRAM_IDS?: string
  PUBLIC_APP_URL?: string
}

export type Handler = PagesFunction<Env>

const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

/** Клієнт з правами сервісу: обходить RLS, використовувати лише на сервері. */
export const adminClient = (env: Env): SupabaseClient => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, noSession)
export const anonClient = (env: Env): SupabaseClient => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, noSession)

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

export function adminTelegramIds(env: Env): number[] {
  return (env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x) && x > 0)
}

export function appUrl(env: Env, request: Request): string {
  return (env.PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
}

/** Користувач за токеном з заголовка Authorization або null. */
export async function userFromRequest(env: Env, request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await adminClient(env).auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}
