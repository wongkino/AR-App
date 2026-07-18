import type { FifteenCall, PublicFifteenPlayer, PublicFifteenRoom } from '../../game/fifteenTypes'
import { FIFTEEN_CALLS } from '../../game/fifteenTypes'

type Props = {
  room: PublicFifteenRoom
  me: PublicFifteenPlayer | null
  opponent: PublicFifteenPlayer | null
  playerId: string | null
  countdown: number | null
  liveCall: FifteenCall | null
  liveFingers: number
  speechOk: boolean
  onPickCall: (call: FifteenCall) => void
}

export function FifteenArena({
  room,
  me,
  opponent,
  playerId,
  countdown,
  liveCall,
  liveFingers,
  speechOk,
  onPickCall,
}: Props) {
  const myCall = playerId ? room.lastResult?.calls[playerId] : null
  const foeCall = opponent ? room.lastResult?.calls[opponent.id] : null
  const myFingers = playerId ? room.lastResult?.fingers[playerId] : null
  const foeFingers = opponent ? room.lastResult?.fingers[opponent.id] : null
  const showReveal = room.roundPhase === 'reveal' && room.lastResult

  return (
    <div className="fifteen-arena">
      <div className="fifteen-arena-top">
        <div className="fifteen-arena-score">
          <span>{me?.name ?? '你'}</span>
          <strong>{me?.score ?? 0}</strong>
        </div>
        <div className="fifteen-arena-round">
          {room.roundPhase === 'countdown' && countdown !== null && (
            <span className="fifteen-countdown">{countdown || '出！'}</span>
          )}
          {room.roundPhase === 'throwing' && <span className="fifteen-throw-hint">出手！</span>}
          {room.roundPhase === 'reveal' && <span className="fifteen-reveal-hint">揭曉</span>}
          {room.roundPhase === 'between' && <span className="fifteen-between-hint">下一局…</span>}
          <small>第 {room.round} 局 · 先贏 {room.winTarget} 局</small>
        </div>
        <div className="fifteen-arena-score right">
          <span>{opponent?.name ?? '對手'}</span>
          <strong>{opponent?.score ?? 0}</strong>
        </div>
      </div>

      {room.roundPhase === 'throwing' && (
        <div className="fifteen-throw-panel">
          <div className="fifteen-live-stats">
            <div>
              <span>叫數</span>
              <strong>{liveCall ?? '—'}</strong>
            </div>
            <div>
              <span>指數</span>
              <strong>{liveFingers}</strong>
            </div>
          </div>
          {me?.locked ? (
            <p className="fifteen-throw-status">✓ 已鎖定，等待對手…</p>
          ) : (
            <p className="fifteen-throw-status">
              {speechOk ? '大聲叫「五／十／十五／二十」，同時伸手指' : '撳下方叫數，同時伸手指'}
            </p>
          )}
          {!me?.locked && (
            <div className="fifteen-call-btns" role="group" aria-label="叫數">
              {FIFTEEN_CALLS.map((call) => (
                <button
                  key={call}
                  type="button"
                  className={liveCall === call ? 'active' : undefined}
                  onClick={() => onPickCall(call)}
                >
                  {call}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showReveal && (
        <div className="fifteen-reveal">
          <div className="fifteen-reveal-card self">
            <span>{me?.name ?? '你'}</span>
            <strong>叫 {myCall ?? '—'}</strong>
            <small>{myFingers == null ? '未出手' : `${myFingers} 指`}</small>
          </div>
          <div className="fifteen-reveal-vs">
            <span>總和</span>
            <strong>{room.lastResult?.sum ?? '—'}</strong>
          </div>
          <div className="fifteen-reveal-card foe">
            <span>{opponent?.name ?? '對手'}</span>
            <strong>叫 {foeCall ?? '—'}</strong>
            <small>{foeFingers == null ? '未出手' : `${foeFingers} 指`}</small>
          </div>
          <p className="fifteen-reveal-text">{room.lastResult?.text}</p>
        </div>
      )}

      {room.phase === 'finished' && (
        <div className="fifteen-match-over">
          {room.winnerId === playerId ? '你贏咗！' : room.winnerId ? '你輸咗…' : '對戰結束'}
        </div>
      )}
    </div>
  )
}
