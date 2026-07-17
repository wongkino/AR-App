import type { MatchFormat, PublicRpsRoom, RpsLoadout, ServerMessage } from '../game/rpsTypes'

type Handlers = {
  onOpen?: () => void
  onJoined?: (room: PublicRpsRoom, playerId: string) => void
  onRoomUpdate?: (room: PublicRpsRoom) => void
  onRoundTick?: (countdown: number) => void
  onRoundResult?: (payload: Extract<ServerMessage, { type: 'round_result' }>) => void
  onError?: (message: string) => void
  onClose?: () => void
}

function wsUrl(): string {
  const env = import.meta.env.VITE_RPS_WS_URL as string | undefined
  if (env) return env.replace(/\/$/, '')
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/rps`
}

export class RpsSocket {
  private ws: WebSocket | null = null
  private handlers: Handlers = {}

  connect(handlers: Handlers): void {
    this.handlers = handlers
    this.ws?.close()
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

    ws.onclose = () => handlers.onClose?.()
    ws.onerror = () => handlers.onError?.('連線中斷，請檢查網路')
  }

  private send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.handlers.onError?.('尚未連線到對戰伺服器')
      return
    }
    this.ws.send(JSON.stringify(payload))
  }

  join(roomCode: string | undefined, playerName: string): void {
    this.send({ type: 'join', roomCode, playerName })
  }

  setFormat(format: MatchFormat): void {
    this.send({ type: 'set_format', format })
  }

  ready(loadout: RpsLoadout): void {
    this.send({ type: 'ready', loadout })
  }

  throwMove(move: string, gestureId: string, score: number): void {
    this.send({ type: 'throw', move, gestureId, score })
  }

  rematch(): void {
    this.send({ type: 'rematch' })
  }

  leave(): void {
    this.send({ type: 'leave' })
    this.ws?.close()
    this.ws = null
  }
}
