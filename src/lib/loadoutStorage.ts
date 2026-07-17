import type { MoveLoadout, MoveType } from '../game/types'
import type { RpsLoadout, RpsMove } from '../game/rpsTypes'
import type { SavedGesture } from '../types'

const FIGHT_KEY = 'gesture-lab:fight-loadout'
const RPS_KEY = 'gesture-lab:rps-loadout'

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

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadFightLoadout(): MoveLoadout {
  const saved = readJson<Partial<MoveLoadout>>(FIGHT_KEY)
  if (!saved) return { ...EMPTY_FIGHT_LOADOUT }
  return {
    punch: saved.punch ?? null,
    kick: saved.kick ?? null,
    special: saved.special ?? null,
    block: saved.block ?? null,
  }
}

export function saveFightLoadout(loadout: MoveLoadout): void {
  localStorage.setItem(FIGHT_KEY, JSON.stringify(loadout))
}

export function loadRpsLoadout(): RpsLoadout {
  const saved = readJson<Partial<RpsLoadout>>(RPS_KEY)
  if (!saved) return { ...EMPTY_RPS_LOADOUT }
  return {
    rock: saved.rock ?? null,
    scissors: saved.scissors ?? null,
    paper: saved.paper ?? null,
  }
}

export function saveRpsLoadout(loadout: RpsLoadout): void {
  localStorage.setItem(RPS_KEY, JSON.stringify(loadout))
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
