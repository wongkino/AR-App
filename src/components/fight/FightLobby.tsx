import type { MoveLoadout, MoveType, PublicRoomState } from '../../game/types'
import { MOVE_HINTS, MOVE_LABELS } from '../../game/types'
import type { SavedGesture } from '../../types'

const MOVES: MoveType[] = ['punch', 'kick', 'special', 'block']

type Props = {
  room: PublicRoomState | null
  playerId: string | null
  playerName: string
  roomCodeInput: string
  loadout: MoveLoadout
  gestures: SavedGesture[]
  connected: boolean
  error: string | null
  onPlayerNameChange: (v: string) => void
  onRoomCodeInputChange: (v: string) => void
  onLoadoutChange: (move: MoveType, gestureId: string) => void
  onCreateRoom: () => void
  onJoinRoom: () => void
  onReady: () => void
  onRematch: () => void
}

export function FightLobby({
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
  const allReady = room?.players.length === 2 && room.players.every((p) => p.ready)

  return (
    <div className="fight-panel">
      <header className="fight-panel-head">
        <div>
          <p className="fight-kicker">Multiplayer</p>
          <h1>手勢格鬥</h1>
        </div>
        <a className="fight-link" href="/">
          ← 返回 Gesture Lab
        </a>
      </header>

      {!room && (
        <section className="fight-card">
          <h2>加入對戰</h2>
          <label className="fight-field">
            <span>玩家名稱</span>
            <input
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              placeholder="輸入暱稱"
              maxLength={16}
            />
          </label>
          <div className="fight-actions">
            <button type="button" className="primary" disabled={!connected} onClick={onCreateRoom}>
              建立房間
            </button>
          </div>
          <label className="fight-field">
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
          <section className="fight-card fight-room-code">
            <span>房間代碼</span>
            <strong>{room.code}</strong>
            <p className="fight-muted">
              {room.phase === 'lobby' && !allReady && '分享代碼俾朋友加入（最多 2 人）'}
              {room.phase === 'fighting' && '對戰進行中…'}
              {room.phase === 'finished' && '本局結束'}
            </p>
          </section>

          <section className="fight-card">
            <h2>玩家</h2>
            <div className="fight-players">
              <div className={`fight-player${me?.ready ? ' ready' : ''}`}>
                <strong>{me?.name ?? playerName}</strong>
                <span>{me?.ready ? '已準備' : '未準備'}</span>
              </div>
              <span className="fight-vs">VS</span>
              <div className={`fight-player${opponent ? '' : ' empty'}${opponent?.ready ? ' ready' : ''}`}>
                <strong>{opponent?.name ?? '等待對手…'}</strong>
                <span>{opponent ? (opponent.ready ? '已準備' : '未準備') : '—'}</span>
              </div>
            </div>
          </section>

          {room.phase !== 'fighting' && (
            <section className="fight-card">
              <h2>招式配置</h2>
              <p className="fight-muted">為每種招式選一個手勢。建議錄製：直拳、踢腿、大招、雙手擋。</p>
              {gestures.length < 4 ? (
                <p className="fight-warn">
                  資料庫手勢不足 4 個。請先到首頁以管理員身份錄製手勢，或本機試用錄製。
                </p>
              ) : (
                <div className="fight-loadout">
                  {MOVES.map((move) => (
                    <label key={move} className="fight-loadout-row">
                      <span>
                        <strong>{MOVE_LABELS[move]}</strong>
                        <small>{MOVE_HINTS[move]}</small>
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
              {room.phase === 'lobby' && (
                <button
                  type="button"
                  className="primary"
                  disabled={me?.ready || gestures.length < 4}
                  onClick={onReady}
                >
                  {me?.ready ? '已準備' : '準備開打'}
                </button>
              )}
              {room.phase === 'finished' && (
                <button type="button" className="primary" onClick={onRematch}>
                  再戰一局
                </button>
              )}
            </section>
          )}

          <section className="fight-card fight-log">
            <h2>戰報</h2>
            <ul>
              {room.log.length === 0 && <li className="fight-muted">尚無紀錄</li>}
              {[...room.log].reverse().map((entry) => (
                <li key={entry.id}>{entry.text}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      {error && <p className="fight-error">{error}</p>}
      {!connected && <p className="fight-muted">正在連線對戰伺服器…</p>}
    </div>
  )
}
