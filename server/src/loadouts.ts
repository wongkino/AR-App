import { pool } from './db.js'

export type MoveType = 'punch' | 'kick' | 'special' | 'block'
export type RpsMove = 'rock' | 'scissors' | 'paper'
export type MoveLoadout = Record<MoveType, string | null>
export type RpsLoadout = Record<RpsMove, string | null>

export type SharedLoadouts = {
  fight: MoveLoadout
  rps: RpsLoadout
}

const EMPTY_FIGHT: MoveLoadout = {
  punch: null,
  kick: null,
  special: null,
  block: null,
}

const EMPTY_RPS: RpsLoadout = {
  rock: null,
  scissors: null,
  paper: null,
}

let cache: SharedLoadouts | null = null

function normalizeFight(raw: unknown): MoveLoadout {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<MoveLoadout>
  return {
    punch: typeof src.punch === 'string' && src.punch ? src.punch : null,
    kick: typeof src.kick === 'string' && src.kick ? src.kick : null,
    special: typeof src.special === 'string' && src.special ? src.special : null,
    block: typeof src.block === 'string' && src.block ? src.block : null,
  }
}

function normalizeRps(raw: unknown): RpsLoadout {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<RpsLoadout>
  return {
    rock: typeof src.rock === 'string' && src.rock ? src.rock : null,
    scissors: typeof src.scissors === 'string' && src.scissors ? src.scissors : null,
    paper: typeof src.paper === 'string' && src.paper ? src.paper : null,
  }
}

export function emptySharedLoadouts(): SharedLoadouts {
  return { fight: { ...EMPTY_FIGHT }, rps: { ...EMPTY_RPS } }
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
  const result = await pool.query<{ fight: unknown; rps: unknown }>(
    `SELECT fight, rps FROM game_loadouts WHERE id = 'default'`,
  )
  const row = result.rows[0]
  cache = {
    fight: normalizeFight(row?.fight),
    rps: normalizeRps(row?.rps),
  }
  return cache
}

export async function setSharedLoadouts(next: SharedLoadouts): Promise<SharedLoadouts> {
  const fight = normalizeFight(next.fight)
  const rps = normalizeRps(next.rps)
  await pool.query(
    `INSERT INTO game_loadouts (id, fight, rps, updated_at)
     VALUES ('default', $1::jsonb, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE
     SET fight = EXCLUDED.fight, rps = EXCLUDED.rps, updated_at = NOW()`,
    [JSON.stringify(fight), JSON.stringify(rps)],
  )
  cache = { fight, rps }
  return cache
}

export function isFightComplete(loadout: MoveLoadout): boolean {
  return Boolean(loadout.punch && loadout.kick && loadout.special && loadout.block)
}

export function isRpsComplete(loadout: RpsLoadout): boolean {
  return Boolean(loadout.rock && loadout.scissors && loadout.paper)
}

export function invalidateLoadoutCache(): void {
  cache = null
}
