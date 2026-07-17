export type Landmark = { x: number; y: number; z: number }

/**
 * One frame of gesture data.
 * Dual-hand format: 42 landmarks = left(21) + right(21).
 * Legacy single-hand saves may still be length 21.
 */
export type HandFrame = Landmark[]

export type ReactionKind = 'speak' | 'play'

export type Reaction =
  | { kind: 'speak'; text: string }
  | { kind: 'play'; url: string; label?: string }

export type SavedGesture = {
  id: string
  name: string
  /** Primary training take (always present; used by older clients). */
  frames: HandFrame[]
  /** Extra takes of the same gesture; matcher uses best match across all. */
  samples?: HandFrame[][]
  reaction: Reaction
  createdAt: number
  /** 本機試用：只存在瀏覽器，不會寫入資料庫 */
  localOnly?: boolean
}

export type AppMode = 'idle' | 'recording' | 'listening'

export type MatchResult = {
  gestureId: string
  gestureName: string
  score: number
}
