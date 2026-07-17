export type RpsMove = 'rock' | 'scissors' | 'paper'

export type RpsLoadout = Record<RpsMove, string | null>

export type RoundPhase = 'countdown' | 'throwing' | 'reveal' | 'between'

export type RoomPhase = 'lobby' | 'playing' | 'finished'

export type RoundResult = {
  round: number
  moves: Record<string, RpsMove | null>
  winnerId: string | 'draw' | null
  text: string
}

export type RpsLogEntry = {
  id: string
  at: number
  text: string
}

export type PublicRpsPlayer = {
  id: string
  name: string
  ready: boolean
  loadout: RpsLoadout
  score: number
  locked: boolean
}

export type PublicRpsRoom = {
  code: string
  phase: RoomPhase
  players: PublicRpsPlayer[]
  winnerId: string | null
  round: number
  roundPhase: RoundPhase | null
  countdown: number | null
  throwDeadline: number | null
  lastResult: RoundResult | null
  log: RpsLogEntry[]
}

export type ServerMessage =
  | { type: 'joined'; room: PublicRpsRoom; playerId: string }
  | { type: 'room_update'; room: PublicRpsRoom }
  | { type: 'round_tick'; countdown: number }
  | { type: 'round_result'; result: RoundResult; room: PublicRpsRoom }
  | { type: 'error'; message: string }

export const RPS_LABELS: Record<RpsMove, string> = {
  rock: '包',
  scissors: '剪',
  paper: '揼',
}

export const RPS_HINTS: Record<RpsMove, string> = {
  rock: '握拳',
  scissors: '剪刀手',
  paper: '張開手掌',
}

export const RPS_EMOJI: Record<RpsMove, string> = {
  rock: '✊',
  scissors: '✌️',
  paper: '✋',
}
