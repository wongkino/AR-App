export type MatchFormat = 'bo3' | 'bo5'

export type FifteenCall = 5 | 10 | 15 | 20

export type RoundPhase = 'countdown' | 'throwing' | 'reveal' | 'between'

export type RoomPhase = 'lobby' | 'playing' | 'finished'

export type RoundResult = {
  round: number
  calls: Record<string, FifteenCall | null>
  fingers: Record<string, number | null>
  sum: number | null
  winnerId: string | 'draw' | null
  text: string
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
  locked: boolean
}

export type PublicFifteenRoom = {
  code: string
  phase: RoomPhase
  players: PublicFifteenPlayer[]
  winnerId: string | null
  matchFormat: MatchFormat
  winTarget: number
  round: number
  roundPhase: RoundPhase | null
  countdown: number | null
  throwDeadline: number | null
  lastResult: RoundResult | null
  log: FifteenLogEntry[]
}

export type ServerMessage =
  | { type: 'joined'; room: PublicFifteenRoom; playerId: string }
  | { type: 'room_update'; room: PublicFifteenRoom }
  | { type: 'round_tick'; countdown: number }
  | { type: 'round_result'; result: RoundResult; room: PublicFifteenRoom }
  | { type: 'error'; message: string }

export const FIFTEEN_CALLS: FifteenCall[] = [5, 10, 15, 20]

export const MATCH_FORMAT_LABELS: Record<MatchFormat, string> = {
  bo3: '三盤兩勝（先贏 2 局）',
  bo5: '五盤三勝（先贏 3 局）',
}

export function winTargetFor(format: MatchFormat): number {
  return format === 'bo3' ? 2 : 3
}
