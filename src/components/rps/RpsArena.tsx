import type { PublicRpsPlayer, PublicRpsRoom, RpsMove } from '../../game/rpsTypes'
import { RPS_LABELS } from '../../game/rpsTypes'

type Props = {
  room: PublicRpsRoom
  me: PublicRpsPlayer | null
  opponent: PublicRpsPlayer | null
  playerId: string | null
  countdown: number | null
  flashMove: RpsMove | null
}

export function RpsArena({ room, me, opponent, playerId, countdown, flashMove }: Props) {
  const myMove = playerId ? room.lastResult?.moves[playerId] : null
  const foeMove = opponent ? room.lastResult?.moves[opponent.id] : null
  const showReveal = room.roundPhase === 'reveal' && room.lastResult

  return (
    <div className="rps-arena">
      <div className="rps-arena-top">
        <div className="rps-arena-score">
          <span>{me?.name ?? '你'}</span>
          <strong>{me?.score ?? 0}</strong>
        </div>
        <div className="rps-arena-round">
          {room.roundPhase === 'countdown' && countdown !== null && (
            <span className="rps-countdown">{countdown || '出！'}</span>
          )}
          {room.roundPhase === 'throwing' && <span className="rps-throw-hint">出招！</span>}
          {room.roundPhase === 'reveal' && <span className="rps-reveal-hint">揭曉</span>}
          {room.roundPhase === 'between' && <span className="rps-between-hint">下一局…</span>}
          <small>第 {room.round} 局 · 先贏 {room.winTarget} 局</small>
        </div>
        <div className="rps-arena-score right">
          <span>{opponent?.name ?? '對手'}</span>
          <strong>{opponent?.score ?? 0}</strong>
        </div>
      </div>

      {room.roundPhase === 'throwing' && (
        <div className="rps-throw-status">
          {me?.locked
            ? '✓ 你已出招，等待對手…'
            : `對住鏡頭做 ${RPS_LABELS.rock}／${RPS_LABELS.scissors}／${RPS_LABELS.paper}`}
        </div>
      )}

      {flashMove && <div className="rps-move-flash">{RPS_LABELS[flashMove]}</div>}

      {showReveal && (
        <div className="rps-reveal">
          <div className="rps-reveal-card self">
            <span>{me?.name ?? '你'}</span>
            <strong>{myMove ? RPS_LABELS[myMove] : '—'}</strong>
          </div>
          <div className="rps-reveal-vs">VS</div>
          <div className="rps-reveal-card foe">
            <span>{opponent?.name ?? '對手'}</span>
            <strong>{foeMove ? RPS_LABELS[foeMove] : '—'}</strong>
          </div>
          <p className="rps-reveal-text">{room.lastResult?.text}</p>
        </div>
      )}

      {room.phase === 'finished' && (
        <div className="rps-match-over">
          {room.winnerId === playerId ? '你贏咗！' : room.winnerId ? '你輸咗…' : '對戰結束'}
        </div>
      )}
    </div>
  )
}
