import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { initDb, pool, randomUUID } from './db.js'

type GestureBody = {
  id: string
  name: string
  frames: unknown
  reaction: unknown
  createdAt: number
}

const app = new Hono()

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/api/health', (c) => c.json({ ok: true }))

function makeSyncKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const part = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  return `${part(3)}-${part(3)}-${part(3)}`
}

async function getWorkspaceByKey(syncKey: string) {
  const key = syncKey.trim().toUpperCase()
  const result = await pool.query<{ id: string; sync_key: string }>(
    'SELECT id, sync_key FROM workspaces WHERE sync_key = $1',
    [key],
  )
  return result.rows[0] ?? null
}

app.post('/api/workspaces', async (c) => {
  for (let i = 0; i < 8; i++) {
    const syncKey = makeSyncKey()
    try {
      const result = await pool.query<{ id: string; sync_key: string }>(
        'INSERT INTO workspaces (id, sync_key) VALUES ($1, $2) RETURNING id, sync_key',
        [randomUUID(), syncKey],
      )
      return c.json({ id: result.rows[0].id, syncKey: result.rows[0].sync_key }, 201)
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? (err as { code: string }).code : ''
      if (code !== '23505') throw err
    }
  }
  return c.json({ error: '無法建立同步空間' }, 500)
})

app.get('/api/workspaces/:syncKey', async (c) => {
  const workspace = await getWorkspaceByKey(c.req.param('syncKey'))
  if (!workspace) return c.json({ error: '找不到此同步碼' }, 404)
  return c.json({ id: workspace.id, syncKey: workspace.sync_key })
})

app.get('/api/workspaces/:syncKey/gestures', async (c) => {
  const workspace = await getWorkspaceByKey(c.req.param('syncKey'))
  if (!workspace) return c.json({ error: '找不到此同步碼' }, 404)

  const result = await pool.query<{
    id: string
    name: string
    frames: unknown
    reaction: unknown
    created_at: string
  }>(
    `SELECT id, name, frames, reaction, created_at
     FROM gestures
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspace.id],
  )

  return c.json({
    gestures: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      frames: row.frames,
      reaction: row.reaction,
      createdAt: Number(row.created_at),
    })),
  })
})

/** Replace all gestures for a workspace (full sync). */
app.put('/api/workspaces/:syncKey/gestures', async (c) => {
  const workspace = await getWorkspaceByKey(c.req.param('syncKey'))
  if (!workspace) return c.json({ error: '找不到此同步碼' }, 404)

  const body = await c.req.json<{ gestures?: GestureBody[] }>()
  const gestures = Array.isArray(body.gestures) ? body.gestures : null
  if (!gestures) return c.json({ error: '無效的手勢資料' }, 400)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM gestures WHERE workspace_id = $1', [workspace.id])

    for (const g of gestures) {
      if (!g?.id || !g.name || !g.frames || !g.reaction) {
        throw new Error('INVALID_GESTURE')
      }
      await client.query(
        `INSERT INTO gestures (id, workspace_id, name, frames, reaction, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
        [
          g.id,
          workspace.id,
          g.name,
          JSON.stringify(g.frames),
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

app.delete('/api/workspaces/:syncKey/gestures/:gestureId', async (c) => {
  const workspace = await getWorkspaceByKey(c.req.param('syncKey'))
  if (!workspace) return c.json({ error: '找不到此同步碼' }, 404)

  await pool.query('DELETE FROM gestures WHERE workspace_id = $1 AND id = $2', [
    workspace.id,
    c.req.param('gestureId'),
  ])
  return c.json({ ok: true })
})

/** Serve Vite build (web + api in one process) when public/ exists. */
const staticRoot = process.env.STATIC_DIR ?? join(process.cwd(), 'public')
if (existsSync(staticRoot)) {
  app.use('/*', serveStatic({ root: staticRoot }))
  app.get('*', serveStatic({ root: staticRoot, path: './index.html' }))
}

const port = Number(process.env.PORT ?? 3001)

await initDb()
console.log(
  existsSync(staticRoot)
    ? `Gesture Lab (web+api) listening on :${port}`
    : `Gesture Lab API listening on :${port}`,
)
serve({ fetch: app.fetch, port })
