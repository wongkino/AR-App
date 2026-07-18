import type { HandMode, MatchFormat, PublicFifteenRoom } from '../../game/fifteenTypes'
import { HAND_MODE_LABELS, MATCH_FORMAT_LABELS } from '../../game/fifteenTypes'

type Props = {
  room: PublicFifteenRoom | null
  playerId: string | null
  playerName: string
  roomCodeInput: string
  connected: boolean
  error: string | null
  speechOk: boolean
  mediaReady: boolean
  micOn: boolean
  micMuted: boolean
  onPlayerNameChange: (v: string) => void
  onRoomCodeInputChange: (v: string) => void
  onCreateRoom: () => void
  onJoinRoom: () => void
  onToggleMute: () => void
  onFormatChange: (format: MatchFormat) => void
  onHandModeChange: (mode: HandMode) => void
}

export function FifteenLobby({
  room,
  playerId,
  playerName,
  roomCodeInput,
  connected,
  error,
  speechOk,
  mediaReady,
  micOn,
  micMuted,
  onPlayerNameChange,
  onRoomCodeInputChange,
  onCreateRoom,
  onJoinRoom,
  onToggleMute,
  onFormatChange,
  onHandModeChange,
}: Props) {
  const me = room?.players.find((p) => p.id === playerId) ?? null
  const isHost = room?.players[0]?.id === playerId
  const maxPlayers = room?.maxPlayers ?? 6
  const settingsLocked = me?.ready === true || Boolean(room?.players.some((p) => p.ready))

  return (
    <div className="fifteen-panel">
      <header className="fifteen-panel-head">
        <div>
          <p className="fifteen-kicker">Multiplayer</p>
          <h1>十五二十</h1>
        </div>
        <a className="fifteen-link" href="/">
          ← 返回主頁
        </a>
      </header>

      {!room && (
        <section className="fifteen-card">
          <h2>加入對戰</h2>
          <p className="fifteen-muted">
            最多 {maxPlayers} 人。房主可選單手／雙手；持續變手指，先叫中全員總和（5／10／15／20）得分。
            房間內會即時語音，可聽到對方叫數。
            {!speechOk && '（此裝置語音辨識不可用，可用按鈕叫數）'}
          </p>
          {!mediaReady && (
            <p className="fifteen-warn">請先撳上方開啟相機與麥克風，再建立／加入房間。</p>
          )}
          <label className="fifteen-field">
            <span>玩家名稱</span>
            <input
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              placeholder="輸入暱稱"
              maxLength={16}
            />
          </label>
          <label className="fifteen-field">
            <span>房間代碼（自訂四字）</span>
            <input
              value={roomCodeInput}
              onChange={(e) =>
                onRoomCodeInputChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))
              }
              placeholder="例如 LOVE"
              maxLength={4}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="fifteen-actions">
            <button
              type="button"
              className="primary"
              disabled={!connected || !mediaReady}
              onClick={onCreateRoom}
            >
              建立房間
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!connected || !mediaReady}
              onClick={onJoinRoom}
            >
              加入房間
            </button>
          </div>
        </section>
      )}

      {room && (
        <>
          <section className="fifteen-card fifteen-room-code">
            <span>房間代碼</span>
            <strong>{room.code}</strong>
            <p className="fifteen-muted">
              {room.phase === 'lobby' && `分享代碼俾朋友加入（最多 ${maxPlayers} 人）`}
              {room.phase === 'playing' && '對戰進行中 · 鬥快叫中總和'}
              {room.phase === 'finished' && '本場結束'}
            </p>
            {micOn && (
              <button type="button" className="secondary fifteen-mute-btn" onClick={onToggleMute}>
                {micMuted ? '解除靜音（對方聽唔到你）' : '靜音咪高峰'}
              </button>
            )}
            {!micOn && <p className="fifteen-warn">無麥克風：聽／傳對方叫聲唔可用</p>}
          </section>

          <section className="fifteen-card">
            <h2>
              比分（{MATCH_FORMAT_LABELS[room.matchFormat]} · {HAND_MODE_LABELS[room.handMode]}）
            </h2>
            <div className="fifteen-scores-multi">
              {room.players.map((p) => (
                <div
                  key={p.id}
                  className={`fifteen-score-card${p.id === room.winnerId ? ' winner' : ''}${p.id === playerId ? ' self' : ''}`}
                >
                  <strong>{p.name}</strong>
                  <span className="fifteen-score-num">{p.score}</span>
                  <small>
                    {room.phase === 'playing' ? `${p.fingers} 指` : p.ready ? '已準備' : '未準備'}
                  </small>
                </div>
              ))}
            </div>
          </section>

          {room.phase === 'lobby' && (
            <section className="fifteen-card">
              <h2>規則</h2>
              {isHost ? (
                <>
                  <label className="fifteen-field">
                    <span>賽制</span>
                    <select
                      value={room.matchFormat}
                      onChange={(e) => onFormatChange(e.target.value as MatchFormat)}
                      disabled={settingsLocked}
                    >
                      {(Object.keys(MATCH_FORMAT_LABELS) as MatchFormat[]).map((format) => (
                        <option key={format} value={format}>
                          {MATCH_FORMAT_LABELS[format]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fifteen-field">
                    <span>手勢模式</span>
                    <select
                      value={room.handMode}
                      onChange={(e) => onHandModeChange(e.target.value as HandMode)}
                      disabled={settingsLocked}
                    >
                      {(Object.keys(HAND_MODE_LABELS) as HandMode[]).map((mode) => (
                        <option key={mode} value={mode}>
                          {HAND_MODE_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <p className="fifteen-muted">
                  {MATCH_FORMAT_LABELS[room.matchFormat]} · {HAND_MODE_LABELS[room.handMode]}
                </p>
              )}
              <p className="fifteen-muted">準備按鈕固定喺鏡頭下方。</p>
            </section>
          )}

          <section className="fifteen-card fifteen-log">
            <h2>戰報</h2>
            <ul>
              {room.log.length === 0 && <li className="fifteen-muted">尚無紀錄</li>}
              {[...room.log].reverse().map((entry) => (
                <li key={entry.id}>{entry.text}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      {error && <p className="fifteen-error">{error}</p>}
      {!connected && <p className="fifteen-muted">正在連線對戰伺服器…</p>}
    </div>
  )
}
