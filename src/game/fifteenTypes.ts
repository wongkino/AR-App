export type MatchFormat = 'bo3' | 'bo5'

export type HandMode = 'one' | 'two'

export type FifteenCall = 5 | 10 | 15 | 20

export type RoomPhase = 'lobby' | 'playing' | 'finished'

export type HitResult = {
  winnerId: string
  call: FifteenCall
  sum: number
  fingers: Record<string, number>
  text: string
  at: number
}

export type FifteenLogEntry = {
  id: string
  at: number
  text: string
}

export type PublicFifteenPlayer = {
  id: string
  name: string
  ready: boolean
  score: number
  fingers: number
}

export type PublicFifteenRoom = {
  code: string
  phase: RoomPhase
  players: PublicFifteenPlayer[]
  winnerId: string | null
  matchFormat: MatchFormat
  handMode: HandMode
  winTarget: number
  maxPlayers: number
  fingersMax: number
  sum: number | null
  lastHit: HitResult | null
  freezeUntil: number
  frozen: boolean
  log: FifteenLogEntry[]
}

export type ServerMessage =
  | { type: 'joined'; room: PublicFifteenRoom; playerId: string }
  | { type: 'room_update'; room: PublicFifteenRoom }
  | { type: 'hit'; result: HitResult; room: PublicFifteenRoom }
  | { type: 'miss'; call: FifteenCall; sum: number; message: string }
  | { type: 'error'; message: string }

export const FIFTEEN_CALLS: FifteenCall[] = [5, 10, 15, 20]

export const MATCH_FORMAT_LABELS: Record<MatchFormat, string> = {
  bo3: '先贏 2 分',
  bo5: '先贏 3 分',
}

export const HAND_MODE_LABELS: Record<HandMode, string> = {
  one: '單手（每人最多 5）',
  two: '雙手（每人最多 10）',
}

export function winTargetFor(format: MatchFormat): number {
  return format === 'bo3' ? 2 : 3
}
