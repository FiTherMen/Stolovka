/**
 * Сервер для власного хостингу (Docker): віддає зібраний сайт з dist/ і виконує ті самі
 * обробники /api/*, що й Cloudflare Pages Functions у папці functions/.
 * Змінні середовища ті самі, що описані в .dev.vars.example.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'
import * as authTelegram from '../functions/api/auth/telegram'
import * as notifyNewOrder from '../functions/api/notify/new-order'
import * as notifyStatus from '../functions/api/notify/status'
import * as notifyPrep from '../functions/api/notify/prep-summary'
import { adminClient } from '../functions/_lib/env'
import { sendPrepSummaries } from '../functions/_lib/prep'
import * as telegramSetup from '../functions/api/telegram/setup'
import * as telegramWebhook from '../functions/api/telegram/webhook'
import type { Env } from '../functions/_lib/env'

type Handler = (ctx: { request: Request; env: Env }) => Response | Promise<Response>

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  '/api/auth/telegram': { POST: authTelegram.onRequestPost as unknown as Handler },
  '/api/notify/new-order': { POST: notifyNewOrder.onRequestPost as unknown as Handler },
  '/api/notify/status': { POST: notifyStatus.onRequestPost as unknown as Handler },
  '/api/telegram/webhook': { POST: telegramWebhook.onRequestPost as unknown as Handler },
  '/api/telegram/setup': { GET: telegramSetup.onRequestGet as unknown as Handler },
  '/api/notify/prep-summary': { GET: notifyPrep.onRequestGet as unknown as Handler },
}

const PORT = Number(process.env.PORT || 3000)
const STATIC_DIR = resolve(process.env.STATIC_DIR || 'dist')
const env = process.env as unknown as Env

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function toRequest(req: IncomingMessage): Request {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http'
  const url = `${proto}://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error потрібно Node для потокового тіла запиту
    duplex: 'half',
  })
}

async function sendResponse(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
  res.end(Buffer.from(await response.arrayBuffer()))
}

function serveStatic(pathname: string, res: ServerResponse) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(STATIC_DIR, safe)
  if (!file.startsWith(STATIC_DIR) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(STATIC_DIR, 'index.html') // маршрути застосунку (/kitchen, /admin…) віддають index.html
  }
  const ext = extname(file)
  const cache = file.includes(`${STATIC_DIR}/assets/`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': cache })
  createReadStream(file).pipe(res)
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    if (pathname.startsWith('/api/')) {
      const handler = ROUTES[pathname]?.[req.method ?? 'GET']
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"not found"}')
        return
      }
      await sendResponse(res, await handler({ request: toRequest(req), env }))
      return
    }
    serveStatic(pathname, res)
  } catch (e) {
    console.error(e)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end('{"error":"internal error"}')
  }
}).listen(PORT, () => console.log(`Тарілка: http://localhost:${PORT}`))

// Щовечора о PREP_SUMMARY_TIME (за замовчуванням 21:05 за Мадридом, одразу після дедлайну сніданків)
// кухарі з підключеним Telegram отримують «Що готувати на завтра». PREP_SUMMARY_TIME=off вимикає.
const PREP_TIME = (process.env.PREP_SUMMARY_TIME || '21:05').trim()
const PREP_TZ = process.env.PREP_SUMMARY_TZ || 'Europe/Madrid'
let prepSentOn = ''
if (/^\d{2}:\d{2}$/.test(PREP_TIME) && env.SUPABASE_SERVICE_ROLE_KEY && env.TELEGRAM_BOT_TOKEN) {
  setInterval(() => {
    const now = new Intl.DateTimeFormat('en-CA', {
      timeZone: PREP_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date()) // '2026-10-31, 21:05'
    const [day, time] = now.split(', ')
    if (time !== PREP_TIME || prepSentOn === day) return
    prepSentOn = day
    const base = env.PUBLIC_APP_URL ? env.PUBLIC_APP_URL.replace(/\/$/, '') : null
    sendPrepSummaries(adminClient(env), env.TELEGRAM_BOT_TOKEN, base)
      .then((r) => console.log(`Що готувати на ${r.date}: надіслано ${r.sent}`))
      .catch((e) => console.error('Що готувати: помилка', e))
  }, 20_000)
}
