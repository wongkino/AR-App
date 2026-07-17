import type { WSContext } from 'hono/ws'

export type MoveType = 'punch' | 'kick' | 'special' | 'block'

export type MoveLoadout = Record<MoveType, string | null>

export type PlayerState = {
  id: string
  name: string
  hp: number
  maxHp: number
  ready: boolean
  loadout: MoveLoadout
  blockingUntil: number
  cooldowns: Record<MoveType, number>
}

export type RoomPhase = 'lobby' | 'fighting' | 'finished'

export type RoomState = {
  code: string
  phase: RoomPhase
  players: PlayerState[]
  winnerId: string | null
  log: FightLogEntry[]
  updatedAt: number
}

export type FightLogEntry = {
  id: string
  at: number
  text: string
}

export type ClientMessage =
  | { type: 'join'; roomCode: string; playerName: string; create?: boolean }
  | { type: 'ready'; loadout: MoveLoadout }
  | { type: 'attack'; move: MoveType; gestureId: string; score: number }
  | { type: 'leave' }
  | { type: 'rematch' }

export type ServerMessage =
  | { type: 'joined'; room: PublicRoomState; playerId: string }
  | { type: 'room_update'; room: PublicRoomState }
  | { type: 'attack_result'; attackerId: string; move: MoveType; damage: number; blocked: boolean; log: FightLogEntry }
  | { type: 'error'; message: string }

export type PublicPlayerState = {
  id: string
  name: string
  hp: number
  maxHp: number
  ready: boolean
  loadout: MoveLoadout
}

export type PublicRoomState = {
  code: string
  phase: RoomPhase
  players: PublicPlayerState[]
  winnerId: string | null
  log: FightLogEntry[]
}

const MOVE_STATS: Record<
  MoveType,
  { damage: number; cooldownMs: number; label: string }
> = {
  punch: { damage: 12, cooldownMs: 1400, label: '拳' },
  kick: { damage: 18, cooldownMs: 2000, label: '踢' },
  special: { damage: 30, cooldownMs: 3800, label: '必殺' },
  block: { damage: 0, cooldownMs: 1200, label: '擋' },
}

const MAX_HP = 100
const BLOCK_DURATION_MS = 1600
const BLOCK_REDUCTION = 0.72
const ROOM_TTL_MS = 30 * 60 * 1000

type Connection = {
  playerId: string
  roomCode: string
  ws: WSContext
}

function emptyLoadout(): MoveLoadout {
  return { punch: null, kick: null, special: null, block: null }
}

function emptyCooldowns(): Record<MoveType, number> {
  return { punch: 0, kick: 0, special: 0, block: 0 }
}

function createPlayer(name: string): PlayerState {
  return {
    id: crypto.randomUUID(),
    name: name.slice(0, 16) || '玩家',
    hp: MAX_HP,
    maxHp: MAX_HP,
    ready: false,
    loadout: emptyLoadout(),
    blockingUntil: 0,
    cooldowns: emptyCooldowns(),
  }
}

function toPublicPlayer(player: PlayerState): PublicPlayerState {
  return {
    id: player.id,
    name: player.name,
    hp: player.hp,
    maxHp: player.maxHp,
    ready: player.ready,
    loadout: player.loadout,
  }
}

function toPublicRoom(room: RoomState): PublicRoomState {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map(toPublicPlayer),
    winnerId: room.winnerId,
    log: room.log.slice(-12),
  }
}

function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase()
}

function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(code)
}

function makeLog(text: string): FightLogEntry {
  return { id: crypto.randomUUID(), at: Date.now(), text }
}

export class GameHub {
  private rooms = new Map<string, RoomState>()
  private connections = new Map<WSContext, Connection>()

  handleOpen(_ws: WSContext): void {
    // wait for join message
  }

  handleClose(ws: WSContext): void {
    const conn = this.connections.get(ws)
    if (!conn) return
    this.removePlayer(conn.roomCode, conn.playerId)
    this.connections.delete(ws)
  }

  handleMessage(ws: WSContext, raw: string): void {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw) as ClientMessage
    } catch {
      this.send(ws, { type: 'error', message: '無效的訊息格式' })
      return
    }

    switch (msg.type) {
      case 'join':
        this.handleJoin(ws, normalizeRoomCode(msg.roomCode || ''), msg.playerName, Boolean(msg.create))
        break
      case 'ready':
        this.handleReady(ws, msg.loadout)
        break
      case 'attack':
        this.handleAttack(ws, msg.move, msg.gestureId, msg.score)
        break
      case 'leave':
        this.handleLeave(ws)
        break
      case 'rematch':
        this.handleRematch(ws)
        break
      default:
        this.send(ws, { type: 'error', message: '未知指令' })
    }
  }

  private handleJoin(ws: WSContext, requestedCode: string, playerName: string, create: boolean): void {
    if (this.connections.has(ws)) {
      this.send(ws, { type: 'error', message: '你已加入房間' })
      return
    }

    if (!isValidRoomCode(requestedCode)) {
      this.send(ws, { type: 'error', message: '房間代碼須為四位英數' })
      return
    }

    this.pruneRooms()

    let room = this.rooms.get(requestedCode)

    if (create) {
      if (room) {
        this.send(ws, { type: 'error', message: '房間代碼已被使用' })
        return
      }
      room = {
        code: requestedCode,
        phase: 'lobby',
        players: [],
        winnerId: null,
        log: [makeLog('房間已建立，等待對手加入…')],
        updatedAt: Date.now(),
      }
      this.rooms.set(requestedCode, room)
    } else if (!room) {
      this.send(ws, { type: 'error', message: '找不到房間代碼' })
      return
    }

    if (room.phase !== 'lobby') {
      this.send(ws, { type: 'error', message: '對戰已開始，請開新房或等下一局' })
      return
    }

    if (room.players.length >= 2) {
      this.send(ws, { type: 'error', message: '房間已滿（最多 2 人）' })
      return
    }

    const player = createPlayer(playerName)
    room.players.push(player)
    room.updatedAt = Date.now()
    room.log.push(makeLog(`${player.name} 加入房間`))

    this.connections.set(ws, { playerId: player.id, roomCode: room.code, ws })
    this.send(ws, { type: 'joined', room: toPublicRoom(room), playerId: player.id })
    this.broadcastRoom(room.code)
  }

  private handleReady(ws: WSContext, loadout: MoveLoadout): void {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room) return

    const player = room.players.find((p) => p.id === ctx.playerId)
    if (!player) return

    if (room.phase !== 'lobby') {
      this.send(ws, { type: 'error', message: '目前無法變更準備狀態' })
      return
    }

    const moves: MoveType[] = ['punch', 'kick', 'special', 'block']
    for (const move of moves) {
      const gestureId = loadout[move]
      player.loadout[move] = typeof gestureId === 'string' && gestureId ? gestureId : null
    }

    const assigned = moves.filter((m) => player.loadout[m])
    if (assigned.length < 4) {
      this.send(ws, { type: 'error', message: '請為拳、踢、必殺、擋各選一個手勢' })
      return
    }

    player.ready = true
    room.updatedAt = Date.now()
    room.log.push(makeLog(`${player.name} 已準備`))

    if (room.players.length === 2 && room.players.every((p) => p.ready)) {
      this.startFight(room)
    } else {
      this.broadcastRoom(room.code)
    }
  }

  private startFight(room: RoomState): void {
    room.phase = 'fighting'
    room.winnerId = null
    room.updatedAt = Date.now()
    for (const player of room.players) {
      player.hp = MAX_HP
      player.blockingUntil = 0
      player.cooldowns = emptyCooldowns()
    }
    room.log.push(makeLog('對戰開始！做出手勢攻擊或格擋！'))
    this.broadcastRoom(room.code)
  }

  private handleAttack(ws: WSContext, move: MoveType, gestureId: string, score: number): void {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room || room.phase !== 'fighting') return

    const attacker = room.players.find((p) => p.id === ctx.playerId)
    if (!attacker) return

    if (score < 0.58) {
      this.send(ws, { type: 'error', message: '手勢匹配度不足' })
      return
    }

    if (attacker.loadout[move] !== gestureId) {
      this.send(ws, { type: 'error', message: '手勢與招式不符' })
      return
    }

    const now = Date.now()
    if (attacker.cooldowns[move] > now) {
      this.send(ws, { type: 'error', message: '招式冷卻中' })
      return
    }

    const stats = MOVE_STATS[move]
    attacker.cooldowns[move] = now + stats.cooldownMs

    if (move === 'block') {
      attacker.blockingUntil = now + BLOCK_DURATION_MS
      const entry = makeLog(`${attacker.name} 擋招！`)
      room.log.push(entry)
      room.updatedAt = now
      this.broadcastRoom(room.code)
      this.broadcastAttack(room.code, {
        attackerId: attacker.id,
        move,
        damage: 0,
        blocked: true,
        log: entry,
      })
      return
    }

    const defender = room.players.find((p) => p.id !== attacker.id)
    if (!defender) return

    let damage = stats.damage
    let blocked = false
    if (defender.blockingUntil > now) {
      damage = Math.max(1, Math.round(damage * (1 - BLOCK_REDUCTION)))
      blocked = true
    }

    defender.hp = Math.max(0, defender.hp - damage)
    const entry = makeLog(
      blocked
        ? `${attacker.name} 使出${stats.label}！${defender.name} 格擋後仍受 ${damage} 點傷害`
        : `${attacker.name} 使出${stats.label}，${defender.name} 受到 ${damage} 點傷害`,
    )
    room.log.push(entry)
    room.updatedAt = now

    if (defender.hp <= 0) {
      room.phase = 'finished'
      room.winnerId = attacker.id
      room.log.push(makeLog(`${attacker.name} 獲勝！`))
    }

    this.broadcastRoom(room.code)
    this.broadcastAttack(room.code, {
      attackerId: attacker.id,
      move,
      damage,
      blocked,
      log: entry,
    })
  }

  private handleLeave(ws: WSContext): void {
    const conn = this.connections.get(ws)
    if (!conn) return
    this.removePlayer(conn.roomCode, conn.playerId)
    this.connections.delete(ws)
    ws.close()
  }

  private handleRematch(ws: WSContext): void {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room || room.phase !== 'finished') return

    for (const player of room.players) {
      player.ready = false
      player.hp = MAX_HP
      player.blockingUntil = 0
      player.cooldowns = emptyCooldowns()
    }
    room.phase = 'lobby'
    room.winnerId = null
    room.updatedAt = Date.now()
    room.log.push(makeLog('等待雙方重新準備…'))
    this.broadcastRoom(room.code)
  }

  private removePlayer(roomCode: string, playerId: string): void {
    const room = this.rooms.get(roomCode)
    if (!room) return

    const idx = room.players.findIndex((p) => p.id === playerId)
    if (idx === -1) return

    const [removed] = room.players.splice(idx, 1)
    room.updatedAt = Date.now()
    room.log.push(makeLog(`${removed.name} 離開房間`))

    if (room.players.length === 0) {
      this.rooms.delete(roomCode)
      return
    }

    if (room.phase === 'fighting') {
      room.phase = 'finished'
      room.winnerId = room.players[0]?.id ?? null
      room.log.push(makeLog('對手離線，對戰結束'))
    } else {
      room.phase = 'lobby'
      for (const p of room.players) {
        p.ready = false
      }
    }

    this.broadcastRoom(roomCode)
  }

  private requireConnection(ws: WSContext): Connection | null {
    const conn = this.connections.get(ws)
    if (!conn) {
      this.send(ws, { type: 'error', message: '尚未加入房間' })
      return null
    }
    return conn
  }

  private broadcastRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode)
    if (!room) return
    const payload: ServerMessage = { type: 'room_update', room: toPublicRoom(room) }
    const json = JSON.stringify(payload)
    for (const conn of this.connections.values()) {
      if (conn.roomCode !== roomCode) continue
      try {
        conn.ws.send(json)
      } catch {
        // ignore broken sockets
      }
    }
  }

  private broadcastAttack(
    roomCode: string,
    payload: {
      attackerId: string
      move: MoveType
      damage: number
      blocked: boolean
      log: FightLogEntry
    },
  ): void {
    const msg: ServerMessage = {
      type: 'attack_result',
      attackerId: payload.attackerId,
      move: payload.move,
      damage: payload.damage,
      blocked: payload.blocked,
      log: payload.log,
    }
    const json = JSON.stringify(msg)
    for (const conn of this.connections.values()) {
      if (conn.roomCode !== roomCode) continue
      try {
        conn.ws.send(json)
      } catch {
        // ignore
      }
    }
  }

  private send(ws: WSContext, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // ignore
    }
  }

  private pruneRooms(): void {
    const cutoff = Date.now() - ROOM_TTL_MS
    for (const [code, room] of this.rooms.entries()) {
      if (room.updatedAt < cutoff && room.players.length === 0) {
        this.rooms.delete(code)
      }
    }
  }
}

export const gameHub = new GameHub()
