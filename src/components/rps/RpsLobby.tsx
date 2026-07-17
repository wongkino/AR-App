import type { PublicRpsRoom, RpsLoadout, RpsMove } from '../../game/rpsTypes'
import { RPS_HINTS, RPS_LABELS } from '../../game/rpsTypes'
import type { SavedGesture } from '../../types'

const MOVES: RpsMove[] = ['rock', 'scissors', 'paper']

type Props = {
  room: PublicRpsRoom | null
  playerId: string | null
  playerName: string
  roomCodeInput: string
  loadout: RpsLoadout
  gestures: SavedGesture[]
  connected: boolean
  error: string | null
  onPlayerNameChange: (v: string) => void
  onRoomCodeInputChange: (v: string) => void
  onLoadoutChange: (move: RpsMove, gestureId: string) => void
  onCreateRoom: () => void
  onJoinRoom: () => void
  onReady: () => void
  onRematch: () => void
}

export function RpsLobby({
  room,
  playerId,
  playerName,
  roomCodeInput,
  loadout,
  gestures,
  connected,
  error,
  onPlayerNameChange,
  onRoomCodeInputChange,
  onLoadoutChange,
  onCreateRoom,
  onJoinRoom,
  onReady,
  onRematch,
}: Props) {
  const me = room?.players.find((p) => p.id === playerId) ?? null
  const opponent = room?.players.find((p) => p.id !== playerId) ?? null

  return (
    <div className="rps-panel">
      <header className="rps-panel-head">
        <div>
          <p className="rps-kicker">Multiplayer</p>
          <h1>包剪揼</h1>
        </div>
        <a className="rps-link" href="/">
          ← 返回 Gesture Lab
        </a>
      </header>

      {!room && (
        <section className="rps-card">
          <h2>加入對戰</h2>
          <label className="rps-field">
            <span>玩家名稱</span>
            <input
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              placeholder="輸入暱稱"
              maxLength={16}
            />
          </label>
          <div className="rps-actions">
            <button type="button" className="primary" disabled={!connected} onClick={onCreateRoom}>
              建立房間
            </button>
          </div>
          <label className="rps-field">
            <span>房間代碼</span>
            <input
              value={roomCodeInput}
              onChange={(e) => onRoomCodeInputChange(e.target.value.toUpperCase())}
              placeholder="例如 AB12"
              maxLength={4}
            />
          </label>
          <button type="button" className="secondary" disabled={!connected} onClick={onJoinRoom}>
            加入房間
          </button>
        </section>
      )}

      {room && (
        <>
          <section className="rps-card rps-room-code">
            <span>房間代碼</span>
            <strong>{room.code}</strong>
            <p className="rps-muted">
              {room.phase === 'lobby' && '分享代碼俾朋友加入（最多 2 人）'}
              {room.phase === 'playing' && `第 ${room.round} 局進行中`}
              {room.phase === 'finished' && '本場結束'}
            </p>
          </section>

          <section className="rps-card">
            <h2>比分（先贏 3 分）</h2>
            <div className="rps-scores">
              <div className={`rps-score-card${me?.id === room.winnerId ? ' winner' : ''}`}>
                <strong>{me?.name ?? playerName}</strong>
                <span className="rps-score-num">{me?.score ?? 0}</span>
                <small>{me?.ready ? '已準備' : '未準備'}</small>
              </div>
              <span className="rps-vs">VS</span>
              <div className={`rps-score-card${opponent?.id === room.winnerId ? ' winner' : ''}`}>
                <strong>{opponent?.name ?? '等待對手…'}</strong>
                <span className="rps-score-num">{opponent?.score ?? 0}</span>
                <small>{opponent ? (opponent.ready ? '已準備' : '未準備') : '—'}</small>
              </div>
            </div>
          </section>

          {room.phase === 'lobby' && (
            <section className="rps-card">
              <h2>手勢配置</h2>
              <p className="rps-muted">為包（拳）、剪、揼各選一個手勢。建議錄製握拳、剪刀手、張開手掌。</p>
              {gestures.length < 3 ? (
                <p className="rps-warn">手勢不足 3 個，請先到首頁錄製包、剪、揼手勢。</p>
              ) : (
                <div className="rps-loadout">
                  {MOVES.map((move) => (
                    <label key={move} className="rps-loadout-row">
                      <span>
                        <strong>{RPS_LABELS[move]}</strong>
                        <small>{RPS_HINTS[move]}</small>
                      </span>
                      <select
                        value={loadout[move] ?? ''}
                        onChange={(e) => onLoadoutChange(move, e.target.value)}
                        disabled={me?.ready === true}
                      >
                        <option value="">選擇手勢</option>
                        {gestures.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="primary"
                disabled={me?.ready || gestures.length < 3}
                onClick={onReady}
              >
                {me?.ready ? '已準備' : '準備開打'}
              </button>
            </section>
          )}

          {room.phase === 'finished' && (
            <section className="rps-card">
              <button type="button" className="primary" onClick={onRematch}>
                再戰一局
              </button>
            </section>
          )}

          <section className="rps-card rps-log">
            <h2>戰報</h2>
            <ul>
              {room.log.length === 0 && <li className="rps-muted">尚無紀錄</li>}
              {[...room.log].reverse().map((entry) => (
                <li key={entry.id}>{entry.text}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      {error && <p className="rps-error">{error}</p>}
      {!connected && <p className="rps-muted">正在連線對戰伺服器…</p>}
    </div>
  )
}
