import type { FifteenCall, PublicFifteenPlayer, PublicFifteenRoom } from '../../game/fifteenTypes'
import { FIFTEEN_CALLS, HAND_MODE_LABELS } from '../../game/fifteenTypes'

type Props = {
  room: PublicFifteenRoom
  me: PublicFifteenPlayer | null
  playerId: string | null
  liveFingers: number
  missMessage: string | null
  speechOk: boolean
  speechHeard: string | null
  speechHint: string | null
  onPickCall: (call: FifteenCall) => void
}

export function FifteenArena({
  room,
  me,
  playerId,
  liveFingers,
  missMessage,
  speechOk,
  speechHeard,
  speechHint,
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
          <small>
            {room.players.length} 人 · {HAND_MODE_LABELS[room.handMode]} · 先贏 {room.winTarget} 分
          </small>
        </div>
        <div className="fifteen-arena-score right">
          <span>總和</span>
          <strong>{room.sum ?? '—'}</strong>
        </div>
      </div>

      <div className="fifteen-throw-panel">
        <div className="fifteen-fingers-row">
          {room.players.map((p) => (
            <div key={p.id} className={`fifteen-finger-chip${p.id === playerId ? ' self' : ''}`}>
              <span>{p.name}</span>
              <strong>{p.id === playerId ? liveFingers : p.fingers}</strong>
            </div>
          ))}
        </div>

        {showHit ? (
          <p className="fifteen-throw-status hit">{room.lastHit?.text}</p>
        ) : (
          <p className="fifteen-throw-status">
            {speechOk
              ? `持續變手指（最多 ${room.fingersMax}），睇準總和就叫「五／十／十五／二十」`
              : `持續變手指（最多 ${room.fingersMax}），睇準總和就撳下方叫數`}
          </p>
        )}

        {speechOk && speechHeard && !frozen && (
          <p className="fifteen-speech-heard">聽到：{speechHeard}</p>
        )}
        {speechHint && <p className="fifteen-miss">{speechHint}</p>}
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
