import { adminClient, appUrl, json, type Handler } from '../../_lib/env'
import { sendPrepSummaries } from '../../_lib/prep'

/**
 * Щоденне зведення кухарям «Що готувати на завтра».
 * Власний сервер викликає це сам щовечора (див. server/index.ts). Вручну або з cron:
 *   https://<сайт>/api/notify/prep-summary?secret=<TELEGRAM_WEBHOOK_SECRET>[&date=YYYY-MM-DD]
 */
export const onRequestGet: Handler = async ({ request, env }) => {
  const url = new URL(request.url)
  if (!env.TELEGRAM_WEBHOOK_SECRET || url.searchParams.get('secret') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ error: 'forbidden' }, 403)
  }
  const date = url.searchParams.get('date') ?? undefined
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400)
  return json(await sendPrepSummaries(adminClient(env), env.TELEGRAM_BOT_TOKEN, appUrl(env, request), date))
}
