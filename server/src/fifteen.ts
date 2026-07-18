import type { WSContext } from 'hono/ws'

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

export type FifteenPlayerState = {
  id: string
  name: string
  ready: boolean
  score: number
  fingers: number
  callBlockedUntil: number
}

export type FifteenRoomState = {
  code: string
  phase: RoomPhase
  players: FifteenPlayerState[]
  winnerId: string | null
  matchFormat: MatchFormat
  handMode: HandMode
  lastHit: HitResult | null
  freezeUntil: number
  log: FifteenLogEntry[]
  updatedAt: number
}

export type ClientMessage =
  | { type: 'join'; roomCode: string; playerName: string; create?: boolean }
  | { type: 'set_format'; format: MatchFormat }
  | { type: 'set_hand_mode'; handMode: HandMode }
  | { type: 'ready' }
  | { type: 'fingers'; count: number }
  | { type: 'call'; call: FifteenCall }
  | { type: 'leave' }
  | { type: 'rematch' }

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

const DEFAULT_MATCH_FORMAT: MatchFormat = 'bo3'
const DEFAULT_HAND_MODE: HandMode = 'one'
const MAX_PLAYERS = 6
const ROOM_TTL_MS = 30 * 60 * 1000
const HIT_FREEZE_MS = 1400
const MISS_BLOCK_MS = 700
const VALID_CALLS = new Set<FifteenCall>([5, 10, 15, 20])

type Connection = {
  playerId: string
  roomCode: string
  ws: WSContext
}

function winTargetFor(format: MatchFormat): number {
  return format === 'bo3' ? 2 : 3
}

function formatLabel(format: MatchFormat): string {
  return format === 'bo3' ? '先贏 2 分' : '先贏 3 分'
}

function handModeLabel(mode: HandMode): string {
  return mode === 'one' ? '單手（每人最多 5）' : '雙手（每人最多 10）'
}

function fingersMaxFor(mode: HandMode): number {
  return mode === 'one' ? 5 : 10
}

function createPlayer(name: string): FifteenPlayerState {
  return {
    id: crypto.randomUUID(),
    name: name.slice(0, 16) || '玩家',
    ready: false,
    score: 0,
    fingers: 0,
    callBlockedUntil: 0,
  }
}

function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase()
}

function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(code)
}

function makeLog(text: string): FifteenLogEntry {
  return { id: crypto.randomUUID(), at: Date.now(), text }
}

function clampFingers(raw: number, max: number): number {
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(max, Math.round(raw)))
}

function isValidCall(value: unknown): value is FifteenCall {
  return typeof value === 'number' && VALID_CALLS.has(value as FifteenCall)
}

function toPublicPlayer(player: FifteenPlayerState): PublicFifteenPlayer {
  return {
    id: player.id,
    name: player.name,
    ready: player.ready,
    score: player.score,
    fingers: player.fingers,
  }
}

function liveSum(room: FifteenRoomState): number | null {
  if (room.phase !== 'playing' || room.players.length < 2) return null
  return room.players.reduce((s, p) => s + p.fingers, 0)
}

function toPublicRoom(room: FifteenRoomState): PublicFifteenRoom {
  const now = Date.now()
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map(toPublicPlayer),
    winnerId: room.winnerId,
    matchFormat: room.matchFormat,
    handMode: room.handMode,
    winTarget: winTargetFor(room.matchFormat),
    maxPlayers: MAX_PLAYERS,
    fingersMax: fingersMaxFor(room.handMode),
    sum: liveSum(room),
    lastHit: room.lastHit,
    freezeUntil: room.freezeUntil,
    frozen: room.phase === 'playing' && room.freezeUntil > now,
    log: room.log.slice(-14),
  }
}

export class FifteenHub {
  private rooms = new Map<string, FifteenRoomState>()
  private connections = new Map<WSContext, Connection>()

  handleOpen(_ws: WSContext): void {}

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
      case 'set_format':
        this.handleSetFormat(ws, msg.format)
        break
      case 'set_hand_mode':
        this.handleSetHandMode(ws, msg.handMode)
        break
      case 'ready':
        this.handleReady(ws)
        break
      case 'fingers':
        this.handleFingers(ws, msg.count)
        break
      case 'call':
        this.handleCall(ws, msg.call)
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
        matchFormat: DEFAULT_MATCH_FORMAT,
        handMode: DEFAULT_HAND_MODE,
        lastHit: null,
        freezeUntil: 0,
        log: [makeLog('房間已建立，等待玩家加入…')],
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

    if (room.players.length >= MAX_PLAYERS) {
      this.send(ws, { type: 'error', message: `房間已滿（最多 ${MAX_PLAYERS} 人）` })
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

  private handleSetFormat(ws: WSContext, format: MatchFormat): void {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room || room.phase !== 'lobby') return

    if (room.players[0]?.id !== ctx.playerId) {
      this.send(ws, { type: 'error', message: '只有房主可以更改賽制' })
      return
    }

    if (format !== 'bo3' && format !== 'bo5') {
      this.send(ws, { type: 'error', message: '無效的賽制' })
      return
    }

    if (room.players.some((p) => p.ready)) {
      this.send(ws, { type: 'error', message: '已有玩家準備，無法更改賽制' })
      return
    }

    room.matchFormat = format
    room.updatedAt = Date.now()
    room.log.push(makeLog(`賽制已設為 ${formatLabel(format)}`))
    this.broadcastRoom(room.code)
  }

  private handleSetHandMode(ws: WSContext, handMode: HandMode): void {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room || room.phase !== 'lobby') return

    if (room.players[0]?.id !== ctx.playerId) {
      this.send(ws, { type: 'error', message: '只有房主可以更改手勢模式' })
      return
    }

    if (handMode !== 'one' && handMode !== 'two') {
      this.send(ws, { type: 'error', message: '無效的手勢模式' })
      return
    }

    if (room.players.some((p) => p.ready)) {
      this.send(ws, { type: 'error', message: '已有玩家準備，無法更改手勢模式' })
      return
    }

    room.handMode = handMode
    room.updatedAt = Date.now()
    room.log.push(makeLog(`手勢模式：${handModeLabel(handMode)}`))
    this.broadcastRoom(room.code)
  }

  private handleReady(ws: WSContext): void {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room || room.phase !== 'lobby') return

    const player = room.players.find((p) => p.id === ctx.playerId)
    if (!player) return

    player.ready = true
    room.updatedAt = Date.now()
    room.log.push(makeLog(`${player.name} 已準備`))

    if (room.players.length >= 2 && room.players.every((p) => p.ready)) {
      this.startMatch(room)
    } else {
      this.broadcastRoom(room.code)
    }
  }

  private startMatch(room: FifteenRoomState): void {
    room.phase = 'playing'
    room.winnerId = null
    room.lastHit = null
    room.freezeUntil = 0
    for (const player of room.players) {
      player.score = 0
      player.fingers = 0
      player.callBlockedUntil = 0
    }
    room.log.push(
      makeLog(
        `開始！${handModeLabel(room.handMode)} · ${room.players.length} 人 · 先叫中總和得分 · ${formatLabel(room.matchFormat)}`,
      ),
    )
    room.updatedAt = Date.now()
    this.broadcastRoom(room.code)
  }

  private handleFingers(ws: WSContext, count: number): void {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room || room.phase !== 'playing') return

    const player = room.players.find((p) => p.id === ctx.playerId)
    if (!player) return

    const next = clampFingers(count, fingersMaxFor(room.handMode))
    if (player.fingers === next) return

    player.fingers = next
    room.updatedAt = Date.now()
    this.broadcastRoom(room.code)
  }

  private handleCall(ws: WSContext, call: FifteenCall): void {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room || room.phase !== 'playing') return

    if (room.players.length < 2) return

    const player = room.players.find((p) => p.id === ctx.playerId)
    if (!player) return

    if (!isValidCall(call)) {
      this.send(ws, { type: 'error', message: '叫數須為 5／10／15／20' })
      return
    }

    const now = Date.now()
    const sum = room.players.reduce((s, p) => s + p.fingers, 0)

    if (room.freezeUntil > now) {
      this.send(ws, { type: 'miss', call, sum, message: '得分間隔中，繼續變手指…' })
      return
    }

    if (player.callBlockedUntil > now) {
      this.send(ws, { type: 'miss', call, sum, message: '稍等再叫' })
      return
    }

    if (sum !== call) {
      player.callBlockedUntil = now + MISS_BLOCK_MS
      this.send(ws, {
        type: 'miss',
        call,
        sum,
        message: `唔中！而家總和係 ${sum}`,
      })
      return
    }

    player.score += 1
    const parts = room.players.map((p) => p.fingers).join('+')
    const fingers: Record<string, number> = {}
    for (const p of room.players) fingers[p.id] = p.fingers

    const result: HitResult = {
      winnerId: player.id,
      call,
      sum,
      fingers,
      text: `${player.name} 叫中 ${call}！（${parts}）`,
      at: now,
    }
    room.lastHit = result
    room.freezeUntil = now + HIT_FREEZE_MS
    room.log.push(makeLog(result.text))
    room.updatedAt = now

    const target = winTargetFor(room.matchFormat)
    if (player.score >= target) {
      room.phase = 'finished'
      room.winnerId = player.id
      room.log.push(makeLog(`${player.name} 贏得整場！`))
    }

    this.broadcastHit(room.code, result)
    this.broadcastRoom(room.code)
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

    room.phase = 'lobby'
    room.winnerId = null
    room.lastHit = null
    room.freezeUntil = 0
    for (const player of room.players) {
      player.ready = false
      player.score = 0
      player.fingers = 0
      player.callBlockedUntil = 0
    }
    room.updatedAt = Date.now()
    room.log.push(makeLog('等待大家重新準備…'))
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

    if (room.phase === 'playing') {
      if (room.players.length < 2) {
        room.phase = 'finished'
        room.winnerId = room.players[0]?.id ?? null
        room.log.push(makeLog('人數不足，對戰結束'))
      } else {
        room.log.push(makeLog('有人離線，繼續對戰'))
      }
    } else {
      room.phase = 'lobby'
      for (const p of room.players) {
        p.ready = false
        p.score = 0
        p.fingers = 0
        p.callBlockedUntil = 0
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
        // ignore
      }
    }
  }

  private broadcastHit(roomCode: string, result: HitResult): void {
    const room = this.rooms.get(roomCode)
    if (!room) return
    const payload: ServerMessage = { type: 'hit', result, room: toPublicRoom(room) }
    const json = JSON.stringify(payload)
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

export const fifteenHub = new FifteenHub()
