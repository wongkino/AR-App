import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context, Next } from 'hono'
import { initDb, pool } from './db.js'
import { fifteenHub } from './fifteen.js'
import {
  emptySharedLoadouts,
  ensureLoadoutTable,
  getSharedLoadouts,
  setSharedLoadouts,
  type SharedLoadouts,
} from './loadouts.js'
import { rpsHub } from './rps.js'

type GestureBody = {
  id: string
  name: string
  frames: unknown
  samples?: unknown
  reaction: unknown
  createdAt: number
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'gesture-admin'

const app = new Hono()
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Admin-Password'],
  }),
)

async function requireAdmin(c: Context, next: Next) {
  const provided = c.req.header('X-Admin-Password') ?? ''
  if (!ADMIN_PASSWORD || provided !== ADMIN_PASSWORD) {
    return c.json({ error: '需要正確的管理密碼才能儲存或修改手勢' }, 401)
  }
  await next()
}

app.get('/api/health', (c) => c.json({ ok: true }))

app.get(
  '/ws/1520',
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      fifteenHub.handleOpen(ws)
    },
    onMessage(event, ws) {
      fifteenHub.handleMessage(ws, String(event.data))
    },
    onClose(_event, ws) {
      fifteenHub.handleClose(ws)
    },
  })),
)

app.get(
  '/ws/rps',
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      rpsHub.handleOpen(ws)
    },
    onMessage(event, ws) {
      rpsHub.handleMessage(ws, String(event.data))
    },
    onClose(_event, ws) {
      rpsHub.handleClose(ws)
    },
  })),
)

app.post('/api/auth/verify', async (c) => {
  const body = await c.req.json<{ password?: string }>().catch(() => ({} as { password?: string }))
  const password = body.password ?? c.req.header('X-Admin-Password') ?? ''
  if (!password || password !== ADMIN_PASSWORD) {
    return c.json({ ok: false, error: '密碼錯誤' }, 401)
  }
  return c.json({ ok: true })
})

app.get('/api/gestures', async (c) => {
  const result = await pool.query<{
    id: string
    name: string
    frames: unknown
    samples: unknown
    reaction: unknown
    created_at: string
  }>(
    `SELECT id, name, frames, samples, reaction, created_at
     FROM gestures
     ORDER BY created_at DESC`,
  )

  return c.json({
    gestures: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      frames: row.frames,
      samples: Array.isArray(row.samples) ? row.samples : [],
      reaction: row.reaction,
      createdAt: Number(row.created_at),
    })),
  })
})

/** Full replace of all gestures in the database. */
app.put('/api/gestures', requireAdmin, async (c) => {
  const body = await c.req.json<{ gestures?: GestureBody[] }>()
  const gestures = Array.isArray(body.gestures) ? body.gestures : null
  if (!gestures) return c.json({ error: '無效的手勢資料' }, 400)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM gestures')

    for (const g of gestures) {
      if (!g?.id || !g.name || !g.frames || !g.reaction) {
        throw new Error('INVALID_GESTURE')
      }
      const samples = Array.isArray(g.samples) ? g.samples : []
      await client.query(
        `INSERT INTO gestures (id, name, frames, samples, reaction, created_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)`,
        [
          g.id,
          g.name,
          JSON.stringify(g.frames),
          JSON.stringify(samples),
          JSON.stringify(g.reaction),
          g.createdAt ?? Date.now(),
        ],
      )
    }

    await client.query('COMMIT')
    return c.json({ ok: true, count: gestures.length })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err instanceof Error && err.message === 'INVALID_GESTURE') {
      return c.json({ error: '手勢資料格式錯誤' }, 400)
    }
    throw err
  } finally {
    client.release()
  }
})

app.delete('/api/gestures/:gestureId', requireAdmin, async (c) => {
  await pool.query('DELETE FROM gestures WHERE id = $1', [c.req.param('gestureId') ?? ''])
  return c.json({ ok: true })
})

app.get('/api/loadouts', async (c) => {
  const loadouts = await getSharedLoadouts()
  return c.json({ loadouts })
})

app.put('/api/loadouts', requireAdmin, async (c) => {
  const body = await c.req.json<{ loadouts?: SharedLoadouts }>().catch(() => ({} as { loadouts?: SharedLoadouts }))
  const incoming = body.loadouts
  if (!incoming || typeof incoming !== 'object') {
    return c.json({ error: '無效的配對資料' }, 400)
  }
  const loadouts = await setSharedLoadouts({
    rps: incoming.rps ?? emptySharedLoadouts().rps,
  })
  return c.json({ ok: true, loadouts })
})

/**
 * Cantonese (or other) TTS as audio — used when Web Speech is blocked (esp. iOS).
 * Proxies Google Translate TTS with short in-memory cache + language fallbacks.
 */
const ttsCache = new Map<string, { buf: ArrayBuffer; type: string; at: number }>()
const TTS_CACHE_MAX = 80
const TTS_CACHE_TTL_MS = 30 * 60 * 1000

function ttsCacheGet(key: string): { buf: ArrayBuffer; type: string } | null {
  const hit = ttsCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTS_CACHE_TTL_MS) {
    ttsCache.delete(key)
    return null
  }
  return { buf: hit.buf, type: hit.type }
}

function ttsCacheSet(key: string, buf: ArrayBuffer, type: string): void {
  if (ttsCache.size >= TTS_CACHE_MAX) {
    const oldest = ttsCache.keys().next().value
    if (oldest) ttsCache.delete(oldest)
  }
  ttsCache.set(key, { buf, type, at: Date.now() })
}

async function fetchGoogleTts(text: string, lang: string): Promise<{ buf: ArrayBuffer; type: string }> {
  const upstream = new URL('https://translate.google.com/translate_tts')
  upstream.searchParams.set('ie', 'UTF-8')
  upstream.searchParams.set('client', 'tw-ob')
  upstream.searchParams.set('tl', lang)
  upstream.searchParams.set('q', text)

  const res = await fetch(upstream, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      Accept: '*/*',
      Referer: 'https://translate.google.com/',
    },
  })
  if (!res.ok) {
    throw new Error(`upstream ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength < 64) {
    throw new Error('empty audio')
  }
  return {
    buf,
    type: res.headers.get('content-type') ?? 'audio/mpeg',
  }
}

app.get('/api/tts', async (c) => {
  const text = (c.req.query('text') ?? '').trim().slice(0, 180)
  if (!text) return c.json({ error: '缺少文字' }, 400)

  const langRaw = (c.req.query('lang') ?? 'yue').trim().toLowerCase()
  const preferred =
    langRaw === 'yue' || langRaw === 'zh-hk' || langRaw === 'zh_hk'
      ? 'yue'
      : langRaw === 'zh-tw' || langRaw === 'zh_tw'
        ? 'zh-TW'
        : langRaw === 'zh-cn' || langRaw === 'zh_cn' || langRaw === 'zh'
          ? 'zh-CN'
          : langRaw.slice(0, 16)

  // Prefer requested lang, then fall back so one blocked upstream doesn't fail the gesture
  const langs = [...new Set([preferred, 'yue', 'zh-TW', 'zh-CN'])]
  const cacheKey = `${preferred}::${text}`

  const cached = ttsCacheGet(cacheKey)
  if (cached) {
    return new Response(cached.buf, {
      headers: {
        'Content-Type': cached.type,
        'Cache-Control': 'public, max-age=600',
        'X-TTS-Cache': 'hit',
      },
    })
  }

  let lastError = 'unknown'
  for (const lang of langs) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 200 * attempt))
        }
        const { buf, type } = await fetchGoogleTts(text, lang)
        ttsCacheSet(cacheKey, buf, type)
        return new Response(buf, {
          headers: {
            'Content-Type': type,
            'Cache-Control': 'public, max-age=600',
            'X-TTS-Cache': 'miss',
            'X-TTS-Lang': lang,
          },
        })
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'fetch failed'
      }
    }
  }

  return c.json({ error: `無法取得語音（${lastError}）` }, 502)
})

const staticRoot = process.env.STATIC_DIR ?? join(process.cwd(), 'public')
if (existsSync(staticRoot)) {
  app.use('/*', serveStatic({ root: staticRoot }))
  app.get('*', serveStatic({ root: staticRoot, path: './index.html' }))
}

const port = Number(process.env.PORT ?? 3001)

await initDb()
await ensureLoadoutTable()
console.log(
  existsSync(staticRoot)
    ? `Gesture Lab (web+api) listening on :${port}`
    : `Gesture Lab API listening on :${port}`,
)
const server = serve({ fetch: app.fetch, port })
injectWebSocket(server)
