import { pool } from './db.js'

export type RpsMove = 'rock' | 'scissors' | 'paper'
export type RpsLoadout = Record<RpsMove, string | null>

export type SharedLoadouts = {
  rps: RpsLoadout
}

const EMPTY_RPS: RpsLoadout = {
  rock: null,
  scissors: null,
  paper: null,
}

let cache: SharedLoadouts | null = null

function normalizeRps(raw: unknown): RpsLoadout {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<RpsLoadout>
  return {
    rock: typeof src.rock === 'string' && src.rock ? src.rock : null,
    scissors: typeof src.scissors === 'string' && src.scissors ? src.scissors : null,
    paper: typeof src.paper === 'string' && src.paper ? src.paper : null,
  }
}

export function emptySharedLoadouts(): SharedLoadouts {
  return { rps: { ...EMPTY_RPS } }
}

export async function ensureLoadoutTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_loadouts (
      id TEXT PRIMARY KEY,
      fight JSONB NOT NULL DEFAULT '{}'::jsonb,
      rps JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await pool.query(
    `INSERT INTO game_loadouts (id, fight, rps)
     VALUES ('default', '{}'::jsonb, '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
  )
}

export async function getSharedLoadouts(): Promise<SharedLoadouts> {
  if (cache) return cache
  const result = await pool.query<{ rps: unknown }>(
    `SELECT rps FROM game_loadouts WHERE id = 'default'`,
  )
  const row = result.rows[0]
  cache = { rps: normalizeRps(row?.rps) }
  return cache
}

export async function setSharedLoadouts(next: SharedLoadouts): Promise<SharedLoadouts> {
  const rps = normalizeRps(next.rps)
  await pool.query(
    `INSERT INTO game_loadouts (id, fight, rps, updated_at)
     VALUES ('default', '{}'::jsonb, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE
     SET rps = EXCLUDED.rps, updated_at = NOW()`,
    [JSON.stringify(rps)],
  )
  cache = { rps }
  return cache
}

export function isRpsComplete(loadout: RpsLoadout): boolean {
  return Boolean(loadout.rock && loadout.scissors && loadout.paper)
}

export function invalidateLoadoutCache(): void {
  cache = null
}
