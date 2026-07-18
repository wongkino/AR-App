import type { MatchFormat, PublicFifteenRoom } from '../../game/fifteenTypes'
import { MATCH_FORMAT_LABELS } from '../../game/fifteenTypes'

type Props = {
  room: PublicFifteenRoom | null
  playerId: string | null
  playerName: string
  roomCodeInput: string
  connected: boolean
  error: string | null
  speechOk: boolean
  onPlayerNameChange: (v: string) => void
  onRoomCodeInputChange: (v: string) => void
  onCreateRoom: () => void
  onJoinRoom: () => void
  onReady: () => void
  onRematch: () => void
  onFormatChange: (format: MatchFormat) => void
}

export function FifteenLobby({
  room,
  playerId,
  playerName,
  roomCodeInput,
  connected,
  error,
  speechOk,
  onPlayerNameChange,
  onRoomCodeInputChange,
  onCreateRoom,
  onJoinRoom,
  onReady,
  onRematch,
  onFormatChange,
}: Props) {
  const me = room?.players.find((p) => p.id === playerId) ?? null
  const opponent = room?.players.find((p) => p.id !== playerId) ?? null
  const isHost = room?.players[0]?.id === playerId

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
            語音叫 5／10／15／20，雙手伸手指；總和等於自己叫的數就贏。
            {!speechOk && '（此裝置語音不可用，出招時可用按鈕叫數）'}
          </p>
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
            <button type="button" className="primary" disabled={!connected} onClick={onCreateRoom}>
              建立房間
            </button>
            <button type="button" className="secondary" disabled={!connected} onClick={onJoinRoom}>
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
              {room.phase === 'lobby' && '分享代碼俾朋友加入（最多 2 人）'}
              {room.phase === 'playing' && `第 ${room.round} 局進行中`}
              {room.phase === 'finished' && '本場結束'}
            </p>
          </section>

          <section className="fifteen-card">
            <h2>比分（{room.matchFormat ? MATCH_FORMAT_LABELS[room.matchFormat] : '三盤兩勝'}）</h2>
            <div className="fifteen-scores">
              <div className={`fifteen-score-card${me?.id === room.winnerId ? ' winner' : ''}`}>
                <strong>{me?.name ?? playerName}</strong>
                <span className="fifteen-score-num">{me?.score ?? 0}</span>
                <small>{me?.ready ? '已準備' : '未準備'}</small>
              </div>
              <span className="fifteen-vs">VS</span>
              <div className={`fifteen-score-card${opponent?.id === room.winnerId ? ' winner' : ''}`}>
                <strong>{opponent?.name ?? '等待對手…'}</strong>
                <span className="fifteen-score-num">{opponent?.score ?? 0}</span>
                <small>{opponent ? (opponent.ready ? '已準備' : '未準備') : '—'}</small>
              </div>
            </div>
          </section>

          {room.phase === 'lobby' && (
            <section className="fifteen-card">
              <h2>賽制</h2>
              {isHost ? (
                <label className="fifteen-field">
                  <span>選擇對戰規則</span>
                  <select
                    value={room.matchFormat}
                    onChange={(e) => onFormatChange(e.target.value as MatchFormat)}
                    disabled={me?.ready === true || room.players.some((p) => p.ready)}
                  >
                    {(Object.keys(MATCH_FORMAT_LABELS) as MatchFormat[]).map((format) => (
                      <option key={format} value={format}>
                        {MATCH_FORMAT_LABELS[format]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="fifteen-muted">{MATCH_FORMAT_LABELS[room.matchFormat]}</p>
              )}
            </section>
          )}

          {room.phase === 'lobby' && (
            <section className="fifteen-card">
              <h2>準備</h2>
              <p className="fifteen-muted">無需手勢庫配對。開打後用語音叫數＋伸手指。</p>
              <button type="button" className="primary" disabled={me?.ready} onClick={onReady}>
                {me?.ready ? '已準備' : '準備開打'}
              </button>
            </section>
          )}

          {room.phase === 'finished' && (
            <section className="fifteen-card">
              <button type="button" className="primary" onClick={onRematch}>
                再戰一局
              </button>
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
