import type { MatchFormat, PublicRpsRoom, RpsLoadout } from '../../game/rpsTypes'
import { MATCH_FORMAT_LABELS } from '../../game/rpsTypes'
import { rpsLoadoutLabel } from '../../lib/loadoutStorage'
import type { SavedGesture } from '../../types'

type Props = {
  room: PublicRpsRoom | null
  playerId: string | null
  playerName: string
  roomCodeInput: string
  loadout: RpsLoadout
  gestures: SavedGesture[]
  loadoutReady: boolean
  connected: boolean
  error: string | null
  onPlayerNameChange: (v: string) => void
  onRoomCodeInputChange: (v: string) => void
  onCreateRoom: () => void
  onJoinRoom: () => void
  onReady: () => void
  onRematch: () => void
  onFormatChange: (format: MatchFormat) => void
}

export function RpsLobby({
  room,
  playerId,
  playerName,
  roomCodeInput,
  loadout,
  gestures,
  loadoutReady,
  connected,
  error,
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
    <div className="rps-panel">
      <header className="rps-panel-head">
        <div>
          <p className="rps-kicker">Multiplayer</p>
          <h1>包剪揼</h1>
        </div>
        <a className="rps-link" href="/">
          ← 返回主頁
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
          <label className="rps-field">
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
          <div className="rps-actions">
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
            <h2>比分（{room.matchFormat ? MATCH_FORMAT_LABELS[room.matchFormat] : '三盤兩勝'}）</h2>
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
              <h2>賽制</h2>
              {isHost ? (
                <label className="rps-field">
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
                <p className="rps-muted">{MATCH_FORMAT_LABELS[room.matchFormat]}</p>
              )}
            </section>
          )}

          {room.phase === 'lobby' && (
            <section className="rps-card">
              <h2>準備</h2>
              {loadoutReady ? (
                <p className="rps-muted">已套用共用配對：{rpsLoadoutLabel(loadout, gestures)}</p>
              ) : (
                <p className="rps-warn">
                  共用手勢配對尚未完成。請管理員到{' '}
                  <a className="rps-link" href="/">
                    設定
                  </a>{' '}
                  為 ✋ 包／✌️ 剪／👊 揼各指定一個手勢。
                </p>
              )}
              <button
                type="button"
                className="primary"
                disabled={me?.ready || !loadoutReady}
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
