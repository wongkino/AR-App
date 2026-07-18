import type { FifteenCall, PublicFifteenPlayer, PublicFifteenRoom } from '../../game/fifteenTypes'
import { FIFTEEN_CALLS } from '../../game/fifteenTypes'

type Props = {
  room: PublicFifteenRoom
  me: PublicFifteenPlayer | null
  opponent: PublicFifteenPlayer | null
  playerId: string | null
  liveFingers: number
  missMessage: string | null
  speechOk: boolean
  onPickCall: (call: FifteenCall) => void
}

export function FifteenArena({
  room,
  me,
  opponent,
  playerId,
  liveFingers,
  missMessage,
  speechOk,
  onPickCall,
}: Props) {
  const frozen = room.freezeUntil > Date.now()
  const showHit = Boolean(room.lastHit && frozen)

  return (
    <div className="fifteen-arena">
      <div className="fifteen-arena-top">
        <div className="fifteen-arena-score">
          <span>{me?.name ?? '你'}</span>
          <strong>{me?.score ?? 0}</strong>
        </div>
        <div className="fifteen-arena-round">
          <span className="fifteen-throw-hint">{frozen ? '變手指…' : '鬥快叫數！'}</span>
          <small>先贏 {room.winTarget} 分 · 即時變體</small>
        </div>
        <div className="fifteen-arena-score right">
          <span>{opponent?.name ?? '對手'}</span>
          <strong>{opponent?.score ?? 0}</strong>
        </div>
      </div>

      <div className="fifteen-throw-panel">
        <div className="fifteen-live-stats">
          <div>
            <span>你</span>
            <strong>{liveFingers}</strong>
          </div>
          <div>
            <span>對手</span>
            <strong>{opponent?.fingers ?? '—'}</strong>
          </div>
          <div className="fifteen-sum-stat">
            <span>總和</span>
            <strong>{room.sum ?? '—'}</strong>
          </div>
        </div>

        {showHit ? (
          <p className="fifteen-throw-status hit">{room.lastHit?.text}</p>
        ) : (
          <p className="fifteen-throw-status">
            {speechOk
              ? '持續變手指，睇準總和就大聲叫「五／十／十五／二十」'
              : '持續變手指，睇準總和就撳下方叫數'}
          </p>
        )}

        {missMessage && !frozen && <p className="fifteen-miss">{missMessage}</p>}

        {!frozen && room.phase === 'playing' && (
          <div className="fifteen-call-btns" role="group" aria-label="叫數">
            {FIFTEEN_CALLS.map((call) => (
              <button key={call} type="button" onClick={() => onPickCall(call)}>
                {call}
              </button>
            ))}
          </div>
        )}
      </div>

      {room.phase === 'finished' && (
        <div className="fifteen-match-over">
          {room.winnerId === playerId ? '你贏咗！' : room.winnerId ? '你輸咗…' : '對戰結束'}
        </div>
      )}
    </div>
  )
}
