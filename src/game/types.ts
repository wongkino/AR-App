export type MoveType = 'punch' | 'kick' | 'special' | 'block'

export type MoveLoadout = Record<MoveType, string | null>

export type PublicPlayerState = {
  id: string
  name: string
  hp: number
  maxHp: number
  ready: boolean
  loadout: MoveLoadout
}

export type RoomPhase = 'lobby' | 'fighting' | 'finished'

export type FightLogEntry = {
  id: string
  at: number
  text: string
}

export type PublicRoomState = {
  code: string
  phase: RoomPhase
  players: PublicPlayerState[]
  winnerId: string | null
  log: FightLogEntry[]
}

export type ServerMessage =
  | { type: 'joined'; room: PublicRoomState; playerId: string }
  | { type: 'room_update'; room: PublicRoomState }
  | {
      type: 'attack_result'
      attackerId: string
      move: MoveType
      damage: number
      blocked: boolean
      log: FightLogEntry
    }
  | { type: 'error'; message: string }

export const MOVE_LABELS: Record<MoveType, string> = {
  punch: '拳',
  kick: '踢',
  special: '必殺',
  block: '擋',
}

export const MOVE_HINTS: Record<MoveType, string> = {
  punch: '快速直拳',
  kick: '橫掃踢擊',
  special: '蓄力大招',
  block: '雙手防禦',
}
