import { MOVE_LABELS } from '../../game/types'
import type { MoveType, PublicPlayerState } from '../../game/types'

type Props = {
  me: PublicPlayerState | null
  opponent: PublicPlayerState | null
  phase: 'lobby' | 'fighting' | 'finished'
  winnerId: string | null
  playerId: string | null
  lastMove: { move: MoveType; attackerId: string; damage: number } | null
}

export function FightHud({ me, opponent, phase, winnerId, playerId, lastMove }: Props) {
  const won = phase === 'finished' && winnerId === playerId
  const lost = phase === 'finished' && winnerId && winnerId !== playerId

  return (
    <div className="fight-hud">
      <div className="fight-hud-player">
        <span className="fight-hud-name">{me?.name ?? '你'}</span>
        <div className="fight-hp-bar">
          <div
            className="fight-hp-fill self"
            style={{ width: `${((me?.hp ?? 0) / (me?.maxHp ?? 100)) * 100}%` }}
          />
        </div>
        <span className="fight-hp-text">{me?.hp ?? 0} HP</span>
      </div>

      <div className="fight-hud-center">
        {phase === 'fighting' && <span className="fight-hud-status">FIGHT</span>}
        {won && <span className="fight-hud-status win">勝利！</span>}
        {lost && <span className="fight-hud-status lose">落敗</span>}
        {lastMove && phase === 'fighting' && (
          <span className="fight-hud-move">
            {lastMove.attackerId === playerId ? '你' : opponent?.name ?? '對手'} 使出{' '}
            {MOVE_LABELS[lastMove.move]}
            {lastMove.damage > 0 ? ` -${lastMove.damage}` : ''}
          </span>
        )}
      </div>

      <div className="fight-hud-player right">
        <span className="fight-hud-name">{opponent?.name ?? '對手'}</span>
        <div className="fight-hp-bar">
          <div
            className="fight-hp-fill foe"
            style={{ width: `${((opponent?.hp ?? 0) / (opponent?.maxHp ?? 100)) * 100}%` }}
          />
        </div>
        <span className="fight-hp-text">{opponent?.hp ?? 0} HP</span>
      </div>
    </div>
  )
}
