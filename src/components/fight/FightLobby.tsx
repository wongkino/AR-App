import type { MoveLoadout, PublicRoomState } from '../../game/types'
import { fightLoadoutLabel } from '../../lib/loadoutStorage'
import type { SavedGesture } from '../../types'

type Props = {
  room: PublicRoomState | null
  playerId: string | null
  playerName: string
  roomCodeInput: string
  loadout: MoveLoadout
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
}

export function FightLobby({
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
          ← 返回主頁
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
          <label className="fight-field">
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
          <div className="fight-actions">
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
              <h2>準備</h2>
              {loadoutReady ? (
                <p className="fight-muted">已套用共用配對：{fightLoadoutLabel(loadout, gestures)}</p>
              ) : (
                <p className="fight-warn">
                  共用招式配對尚未完成。請管理員到{' '}
                  <a className="fight-link" href="/">
                    設定
                  </a>{' '}
                  為拳／踢／必殺／擋各指定一個手勢。
                </p>
              )}
              {room.phase === 'lobby' && (
                <button
                  type="button"
                  className="primary"
                  disabled={me?.ready || !loadoutReady}
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
