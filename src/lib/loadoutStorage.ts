import type { RpsLoadout, RpsMove } from '../game/rpsTypes'
import type { SavedGesture } from '../types'

export const EMPTY_RPS_LOADOUT: RpsLoadout = {
  rock: null,
  scissors: null,
  paper: null,
}

export const RPS_MOVES: RpsMove[] = ['rock', 'scissors', 'paper']

export type SharedLoadouts = {
  rps: RpsLoadout
}

export function emptySharedLoadouts(): SharedLoadouts {
  return { rps: { ...EMPTY_RPS_LOADOUT } }
}

export function normalizeRpsLoadout(raw: Partial<RpsLoadout> | null | undefined): RpsLoadout {
  return {
    rock: raw?.rock || null,
    scissors: raw?.scissors || null,
    paper: raw?.paper || null,
  }
}

export function sanitizeRpsLoadout(loadout: RpsLoadout, gestures: SavedGesture[]): RpsLoadout {
  const ids = new Set(gestures.map((g) => g.id))
  const next = { ...loadout }
  for (const move of RPS_MOVES) {
    if (next[move] && !ids.has(next[move]!)) next[move] = null
  }
  return next
}

export function isRpsLoadoutComplete(loadout: RpsLoadout): boolean {
  return RPS_MOVES.every((m) => Boolean(loadout[m]))
}

export function rpsLoadoutLabel(loadout: RpsLoadout, gestures: SavedGesture[]): string {
  const nameOf = (id: string | null) => gestures.find((g) => g.id === id)?.name ?? '未設定'
  return RPS_MOVES.map((m) => nameOf(loadout[m])).join('／')
}
