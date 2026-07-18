import type { RpsLoadout, RpsMove } from '../game/rpsTypes'
import { RPS_HINTS, RPS_LABELS } from '../game/rpsTypes'
import { RPS_MOVES } from '../lib/loadoutStorage'
import type { SavedGesture } from '../types'

type Props = {
  gestures: SavedGesture[]
  rpsLoadout: RpsLoadout
  onRpsChange: (move: RpsMove, gestureId: string) => void
  disabled?: boolean
}

export function LoadoutSettings({ gestures, rpsLoadout, onRpsChange, disabled = false }: Props) {
  const rpsComplete = RPS_MOVES.every((m) => Boolean(rpsLoadout[m]))

  return (
    <section className="block">
      <h2>共用手勢配對</h2>
      <p className="hint">全伺服器共用：包剪揼開打使用這裡的配對。十五二十以相機數指，無需配對。</p>

      <div className="loadout-settings">
        <div className="loadout-settings-group">
          <h3>
            ✋✌️👊 包剪揼
            <span className={`loadout-status${rpsComplete ? ' ok' : ''}`}>
              {rpsComplete ? '已完成' : '未完成'}
            </span>
          </h3>
          {gestures.length === 0 ? (
            <p className="hint">請先錄製手勢。</p>
          ) : (
            <div className="loadout-settings-rows">
              {RPS_MOVES.map((move) => (
                <label key={move} className="loadout-settings-row">
                  <span>
                    <strong>{RPS_LABELS[move]}</strong>
                    <small>{RPS_HINTS[move]}</small>
                  </span>
                  <select
                    value={rpsLoadout[move] ?? ''}
                    disabled={disabled}
                    onChange={(e) => onRpsChange(move, e.target.value)}
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
        </div>
      </div>
    </section>
  )
}
