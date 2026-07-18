import type { MatchFormat, PublicFifteenRoom, ServerMessage } from '../game/fifteenTypes'
import type { FifteenCall } from '../game/fifteenTypes'

type Handlers = {
  onOpen?: () => void
  onJoined?: (room: PublicFifteenRoom, playerId: string) => void
  onRoomUpdate?: (room: PublicFifteenRoom) => void
  onRoundTick?: (countdown: number) => void
  onRoundResult?: (payload: Extract<ServerMessage, { type: 'round_result' }>) => void
  onError?: (message: string) => void
  onClose?: () => void
}

function wsUrl(): string {
  const env = import.meta.env.VITE_FIFTEEN_WS_URL as string | undefined
  if (env) return env.replace(/\/$/, '')
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/1520`
}

export class FifteenSocket {
  private ws: WebSocket | null = null
  private handlers: Handlers = {}

  connect(handlers: Handlers): void {
    this.handlers = handlers
    const previous = this.ws
    this.ws = null
    previous?.close()

    const ws = new WebSocket(wsUrl())
    this.ws = ws

    ws.onopen = () => handlers.onOpen?.()

    ws.onmessage = (event) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage
      } catch {
        handlers.onError?.('伺服器訊息解析失敗')
        return
      }

      switch (msg.type) {
        case 'joined':
          handlers.onJoined?.(msg.room, msg.playerId)
          break
        case 'room_update':
          handlers.onRoomUpdate?.(msg.room)
          break
        case 'round_tick':
          handlers.onRoundTick?.(msg.countdown)
          break
        case 'round_result':
          handlers.onRoundResult?.(msg)
          break
        case 'error':
          handlers.onError?.(msg.message)
          break
      }
    }

    ws.onclose = () => {
      if (this.ws !== ws) return
      handlers.onClose?.()
    }

    ws.onerror = () => {
      if (this.ws !== ws) return
      handlers.onError?.('連線中斷，請檢查網路')
    }
  }

  private send(payload: unknown, opts?: { silent?: boolean }): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (!opts?.silent) {
        this.handlers.onError?.('尚未連線到對戰伺服器')
      }
      return false
    }
    this.ws.send(JSON.stringify(payload))
    return true
  }

  join(roomCode: string, playerName: string, create = false): void {
    this.send({ type: 'join', roomCode, playerName, create })
  }

  setFormat(format: MatchFormat): void {
    this.send({ type: 'set_format', format })
  }

  ready(): void {
    this.send({ type: 'ready' })
  }

  lock(call: FifteenCall, fingers: number): void {
    this.send({ type: 'lock', call, fingers })
  }

  rematch(): void {
    this.send({ type: 'rematch' })
  }

  leave(): void {
    this.send({ type: 'leave' }, { silent: true })
    this.disconnect()
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
  }
}
