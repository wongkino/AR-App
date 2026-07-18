import type { WSContext } from 'hono/ws'
import { getSharedLoadouts, isRpsComplete } from './loadouts.js'

export type MatchFormat = 'bo3' | 'bo5'

export type RpsMove = 'rock' | 'scissors' | 'paper'

export type RpsLoadout = Record<RpsMove, string | null>

export type RoundPhase = 'countdown' | 'throwing' | 'reveal' | 'between'

export type RpsPlayerState = {
  id: string
  name: string
  ready: boolean
  loadout: RpsLoadout
  score: number
  lockedMove: RpsMove | null
}

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

export type RpsRoomState = {
  code: string
  phase: RoomPhase
  players: RpsPlayerState[]
  winnerId: string | null
  matchFormat: MatchFormat
  round: number
  roundPhase: RoundPhase | null
  countdown: number | null
  throwDeadline: number | null
  lastResult: RoundResult | null
  log: RpsLogEntry[]
  updatedAt: number
}

export type ClientMessage =
  | { type: 'join'; roomCode: string; playerName: string; create?: boolean }
  | { type: 'set_format'; format: MatchFormat }
  | { type: 'ready'; loadout?: RpsLoadout }
  | { type: 'throw'; move: RpsMove; gestureId: string; score: number }
  | { type: 'leave' }
  | { type: 'rematch' }

export type ServerMessage =
  | { type: 'joined'; room: PublicRpsRoom; playerId: string }
  | { type: 'room_update'; room: PublicRpsRoom }
  | { type: 'round_tick'; countdown: number }
  | { type: 'round_result'; result: RoundResult; room: PublicRpsRoom }
  | { type: 'error'; message: string }

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
  matchFormat: MatchFormat
  winTarget: number
  round: number
  roundPhase: RoundPhase | null
  countdown: number | null
  throwDeadline: number | null
  lastResult: RoundResult | null
  log: RpsLogEntry[]
}

const MOVE_LABELS: Record<RpsMove, string> = {
  rock: '✋ 包',
  scissors: '✌️ 剪',
  paper: '👊 揼',
}

const DEFAULT_MATCH_FORMAT: MatchFormat = 'bo3'

function winTargetFor(format: MatchFormat): number {
  return format === 'bo3' ? 2 : 3
}

function formatLabel(format: MatchFormat): string {
  return format === 'bo3' ? '三盤兩勝' : '五盤三勝'
}
const COUNTDOWN_SEC = 3
const THROW_MS = 5000
const REVEAL_MS = 2800
const BETWEEN_MS = 1200
const ROOM_TTL_MS = 30 * 60 * 1000

type Connection = {
  playerId: string
  roomCode: string
  ws: WSContext
}

type RoomTimers = {
  countdown?: ReturnType<typeof setTimeout>
  throw?: ReturnType<typeof setTimeout>
  reveal?: ReturnType<typeof setTimeout>
  between?: ReturnType<typeof setTimeout>
}

function emptyLoadout(): RpsLoadout {
  return { rock: null, scissors: null, paper: null }
}

function createPlayer(name: string): RpsPlayerState {
  return {
    id: crypto.randomUUID(),
    name: name.slice(0, 16) || '玩家',
    ready: false,
    loadout: emptyLoadout(),
    score: 0,
    lockedMove: null,
  }
}

function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase()
}

function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(code)
}

function makeLog(text: string): RpsLogEntry {
  return { id: crypto.randomUUID(), at: Date.now(), text }
}

function toPublicPlayer(player: RpsPlayerState): PublicRpsPlayer {
  return {
    id: player.id,
    name: player.name,
    ready: player.ready,
    loadout: player.loadout,
    score: player.score,
    locked: player.lockedMove !== null,
  }
}

function toPublicRoom(room: RpsRoomState): PublicRpsRoom {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map(toPublicPlayer),
    winnerId: room.winnerId,
    matchFormat: room.matchFormat,
    winTarget: winTargetFor(room.matchFormat),
    round: room.round,
    roundPhase: room.roundPhase,
    countdown: room.countdown,
    throwDeadline: room.throwDeadline,
    lastResult: room.lastResult,
    log: room.log.slice(-14),
  }
}

function resolveMoves(moveA: RpsMove | null, moveB: RpsMove | null): 'a' | 'b' | 'draw' | null {
  if (!moveA && !moveB) return null
  if (moveA && !moveB) return 'a'
  if (!moveA && moveB) return 'b'
  if (moveA === moveB) return 'draw'
  // Labels: rock=包, scissors=剪, paper=揼 → 粵語：包贏揼、揼贏剪、剪贏包
  if (
    (moveA === 'rock' && moveB === 'paper') ||
    (moveA === 'paper' && moveB === 'scissors') ||
    (moveA === 'scissors' && moveB === 'rock')
  ) {
    return 'a'
  }
  return 'b'
}

function moveLabel(move: RpsMove | null): string {
  return move ? MOVE_LABELS[move] : '未出招'
}

function winText(winnerName: string, winnerMove: RpsMove | null, loserMove: RpsMove | null): string {
  if (!loserMove) {
    return `${winnerName} 贏！對手未出招`
  }
  return `${winnerName} 贏！${moveLabel(winnerMove)} 贏 ${moveLabel(loserMove)}`
}

export class RpsHub {
  private rooms = new Map<string, RpsRoomState>()
  private connections = new Map<WSContext, Connection>()
  private timers = new Map<string, RoomTimers>()

  handleOpen(_ws: WSContext): void {
    // wait for join
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
      case 'set_format':
        this.handleSetFormat(ws, msg.format)
        break
      case 'ready':
        void this.handleReady(ws)
        break
      case 'throw':
        this.handleThrow(ws, msg.move, msg.gestureId, msg.score)
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
        round: 0,
        roundPhase: null,
        countdown: null,
        throwDeadline: null,
        lastResult: null,
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

  private async handleReady(ws: WSContext): Promise<void> {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room || room.phase !== 'lobby') return

    const player = room.players.find((p) => p.id === ctx.playerId)
    if (!player) return

    const shared = await getSharedLoadouts()
    const moves: RpsMove[] = ['rock', 'scissors', 'paper']
    for (const move of moves) {
      player.loadout[move] = shared.rps[move]
    }

    if (!isRpsComplete(player.loadout)) {
      this.send(ws, { type: 'error', message: '共用手勢配對尚未完成，請管理員到設定頁設定' })
      return
    }

    player.ready = true
    room.updatedAt = Date.now()
    room.log.push(makeLog(`${player.name} 已準備`))

    if (room.players.length === 2 && room.players.every((p) => p.ready)) {
      this.startMatch(room)
    } else {
      this.broadcastRoom(room.code)
    }
  }

  private startMatch(room: RpsRoomState): void {
    this.clearTimers(room.code)
    room.phase = 'playing'
    room.winnerId = null
    room.round = 0
    room.lastResult = null
    for (const player of room.players) {
      player.score = 0
      player.lockedMove = null
    }
    room.log.push(makeLog(`包剪揼對戰開始！${formatLabel(room.matchFormat)}（先贏 ${winTargetFor(room.matchFormat)} 局）`))
    room.updatedAt = Date.now()
    this.broadcastRoom(room.code)
    this.scheduleRound(room.code)
  }

  private scheduleRound(roomCode: string): void {
    const room = this.rooms.get(roomCode)
    if (!room || room.phase !== 'playing') return

    room.round += 1
    room.roundPhase = 'countdown'
    room.countdown = COUNTDOWN_SEC
    room.throwDeadline = null
    room.lastResult = null
    for (const player of room.players) {
      player.lockedMove = null
    }
    room.updatedAt = Date.now()
    room.log.push(makeLog(`第 ${room.round} 局開始倒數`))
    this.broadcastRoom(roomCode)

    this.runCountdown(roomCode, COUNTDOWN_SEC)
  }

  private runCountdown(roomCode: string, remaining: number): void {
    const room = this.rooms.get(roomCode)
    if (!room || room.phase !== 'playing' || room.roundPhase !== 'countdown') return

    room.countdown = remaining
    room.updatedAt = Date.now()
    this.broadcastTick(roomCode, remaining)
    this.broadcastRoom(roomCode)

    if (remaining <= 0) {
      this.beginThrowing(roomCode)
      return
    }

    const timers = this.timers.get(roomCode) ?? {}
    timers.countdown = setTimeout(() => this.runCountdown(roomCode, remaining - 1), 1000)
    this.timers.set(roomCode, timers)
  }

  private beginThrowing(roomCode: string): void {
    const room = this.rooms.get(roomCode)
    if (!room || room.phase !== 'playing') return

    room.roundPhase = 'throwing'
    room.countdown = null
    room.throwDeadline = Date.now() + THROW_MS
    room.updatedAt = Date.now()
    room.log.push(makeLog('出招！對住鏡頭做 ✋ 包／✌️ 剪／👊 揼'))
    this.broadcastRoom(roomCode)

    const timers = this.timers.get(roomCode) ?? {}
    timers.throw = setTimeout(() => this.resolveRound(roomCode), THROW_MS)
    this.timers.set(roomCode, timers)
  }

  private handleThrow(ws: WSContext, move: RpsMove, gestureId: string, score: number): void {
    const ctx = this.requireConnection(ws)
    if (!ctx) return
    const room = this.rooms.get(ctx.roomCode)
    if (!room || room.phase !== 'playing' || room.roundPhase !== 'throwing') return

    const player = room.players.find((p) => p.id === ctx.playerId)
    if (!player || player.lockedMove) return

    if (score < 0.58) {
      this.send(ws, { type: 'error', message: '手勢匹配度不足' })
      return
    }

    if (player.loadout[move] !== gestureId) {
      this.send(ws, { type: 'error', message: '手勢與出招不符' })
      return
    }

    player.lockedMove = move
    room.updatedAt = Date.now()
    this.broadcastRoom(room.code)

    if (room.players.every((p) => p.lockedMove)) {
      const timers = this.timers.get(room.code)
      if (timers?.throw) clearTimeout(timers.throw)
      this.resolveRound(room.code)
    }
  }

  private resolveRound(roomCode: string): void {
    const room = this.rooms.get(roomCode)
    if (!room || room.phase !== 'playing') return

    const [a, b] = room.players
    if (!a || !b) return

    room.roundPhase = 'reveal'
    room.throwDeadline = null
    room.updatedAt = Date.now()

    const outcome = resolveMoves(a.lockedMove, b.lockedMove)
    let winnerId: string | 'draw' | null = null
    let text = ''

    if (!a.lockedMove && !b.lockedMove) {
      text = '雙方都未出招，本局作廢'
      winnerId = 'draw'
    } else if (outcome === 'draw') {
      text = `平局！${moveLabel(a.lockedMove)} 對 ${moveLabel(b.lockedMove)}`
      winnerId = 'draw'
    } else if (outcome === 'a') {
      a.score += 1
      text = winText(a.name, a.lockedMove, b.lockedMove)
      winnerId = a.id
    } else if (outcome === 'b') {
      b.score += 1
      text = winText(b.name, b.lockedMove, a.lockedMove)
      winnerId = b.id
    }

    const result: RoundResult = {
      round: room.round,
      moves: {
        [a.id]: a.lockedMove,
        [b.id]: b.lockedMove,
      },
      winnerId,
      text,
    }

    room.lastResult = result
    room.log.push(makeLog(text))

    const target = winTargetFor(room.matchFormat)
    if (a.score >= target) {
      room.phase = 'finished'
      room.winnerId = a.id
      room.log.push(makeLog(`${a.name} 贏得整場對戰！`))
    } else if (b.score >= target) {
      room.phase = 'finished'
      room.winnerId = b.id
      room.log.push(makeLog(`${b.name} 贏得整場對戰！`))
    }

    this.broadcastRoundResult(roomCode, result)
    this.broadcastRoom(roomCode)

    if (room.phase === 'playing') {
      const timers = this.timers.get(roomCode) ?? {}
      timers.reveal = setTimeout(() => {
        const current = this.rooms.get(roomCode)
        if (!current || current.phase !== 'playing') return
        current.roundPhase = 'between'
        current.updatedAt = Date.now()
        this.broadcastRoom(roomCode)
        timers.between = setTimeout(() => this.scheduleRound(roomCode), BETWEEN_MS)
        this.timers.set(roomCode, timers)
      }, REVEAL_MS)
      this.timers.set(roomCode, timers)
    }
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

    this.clearTimers(room.code)
    room.phase = 'lobby'
    room.winnerId = null
    room.round = 0
    room.roundPhase = null
    room.countdown = null
    room.throwDeadline = null
    room.lastResult = null
    for (const player of room.players) {
      player.ready = false
      player.score = 0
      player.lockedMove = null
    }
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
    this.clearTimers(roomCode)

    if (room.players.length === 0) {
      this.rooms.delete(roomCode)
      this.timers.delete(roomCode)
      return
    }

    if (room.phase === 'playing') {
      room.phase = 'finished'
      room.winnerId = room.players[0]?.id ?? null
      room.roundPhase = null
      room.log.push(makeLog('對手離線，對戰結束'))
    } else {
      room.phase = 'lobby'
      for (const p of room.players) {
        p.ready = false
        p.score = 0
        p.lockedMove = null
      }
    }

    this.broadcastRoom(roomCode)
  }

  private clearTimers(roomCode: string): void {
    const timers = this.timers.get(roomCode)
    if (!timers) return
    if (timers.countdown) clearTimeout(timers.countdown)
    if (timers.throw) clearTimeout(timers.throw)
    if (timers.reveal) clearTimeout(timers.reveal)
    if (timers.between) clearTimeout(timers.between)
    this.timers.delete(roomCode)
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

  private broadcastTick(roomCode: string, countdown: number): void {
    const payload: ServerMessage = { type: 'round_tick', countdown }
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

  private broadcastRoundResult(roomCode: string, result: RoundResult): void {
    const room = this.rooms.get(roomCode)
    if (!room) return
    const payload: ServerMessage = {
      type: 'round_result',
      result,
      room: toPublicRoom(room),
    }
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
        this.clearTimers(code)
        this.rooms.delete(code)
      }
    }
  }
}

export const rpsHub = new RpsHub()
