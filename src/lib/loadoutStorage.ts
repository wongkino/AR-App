import type { MoveLoadout, MoveType } from '../game/types'
import type { RpsLoadout, RpsMove } from '../game/rpsTypes'
import type { SavedGesture } from '../types'

export const EMPTY_FIGHT_LOADOUT: MoveLoadout = {
  punch: null,
  kick: null,
  special: null,
  block: null,
}

export const EMPTY_RPS_LOADOUT: RpsLoadout = {
  rock: null,
  scissors: null,
  paper: null,
}

export const FIGHT_MOVES: MoveType[] = ['punch', 'kick', 'special', 'block']
export const RPS_MOVES: RpsMove[] = ['rock', 'scissors', 'paper']

export type SharedLoadouts = {
  fight: MoveLoadout
  rps: RpsLoadout
}

export function emptySharedLoadouts(): SharedLoadouts {
  return { fight: { ...EMPTY_FIGHT_LOADOUT }, rps: { ...EMPTY_RPS_LOADOUT } }
}

export function normalizeFightLoadout(raw: Partial<MoveLoadout> | null | undefined): MoveLoadout {
  return {
    punch: raw?.punch || null,
    kick: raw?.kick || null,
    special: raw?.special || null,
    block: raw?.block || null,
  }
}

export function normalizeRpsLoadout(raw: Partial<RpsLoadout> | null | undefined): RpsLoadout {
  return {
    rock: raw?.rock || null,
    scissors: raw?.scissors || null,
    paper: raw?.paper || null,
  }
}

/** Drop gesture ids that no longer exist in the library. */
export function sanitizeFightLoadout(
  loadout: MoveLoadout,
  gestures: SavedGesture[],
): MoveLoadout {
  const ids = new Set(gestures.map((g) => g.id))
  const next = { ...loadout }
  for (const move of FIGHT_MOVES) {
    if (next[move] && !ids.has(next[move]!)) next[move] = null
  }
  return next
}

export function sanitizeRpsLoadout(loadout: RpsLoadout, gestures: SavedGesture[]): RpsLoadout {
  const ids = new Set(gestures.map((g) => g.id))
  const next = { ...loadout }
  for (const move of RPS_MOVES) {
    if (next[move] && !ids.has(next[move]!)) next[move] = null
  }
  return next
}

export function isFightLoadoutComplete(loadout: MoveLoadout): boolean {
  return FIGHT_MOVES.every((m) => Boolean(loadout[m]))
}

export function isRpsLoadoutComplete(loadout: RpsLoadout): boolean {
  return RPS_MOVES.every((m) => Boolean(loadout[m]))
}

export function fightLoadoutLabel(loadout: MoveLoadout, gestures: SavedGesture[]): string {
  const nameOf = (id: string | null) => gestures.find((g) => g.id === id)?.name ?? '未設定'
  return FIGHT_MOVES.map((m) => nameOf(loadout[m])).join('／')
}

export function rpsLoadoutLabel(loadout: RpsLoadout, gestures: SavedGesture[]): string {
  const nameOf = (id: string | null) => gestures.find((g) => g.id === id)?.name ?? '未設定'
  return RPS_MOVES.map((m) => nameOf(loadout[m])).join('／')
}
