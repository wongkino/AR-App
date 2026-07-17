import type { MoveLoadout, MoveType } from '../game/types'
import { MOVE_HINTS, MOVE_LABELS } from '../game/types'
import type { RpsLoadout, RpsMove } from '../game/rpsTypes'
import { RPS_HINTS, RPS_LABELS } from '../game/rpsTypes'
import { FIGHT_MOVES, RPS_MOVES } from '../lib/loadoutStorage'
import type { SavedGesture } from '../types'

type Props = {
  gestures: SavedGesture[]
  fightLoadout: MoveLoadout
  rpsLoadout: RpsLoadout
  onFightChange: (move: MoveType, gestureId: string) => void
  onRpsChange: (move: RpsMove, gestureId: string) => void
  disabled?: boolean
}

export function LoadoutSettings({
  gestures,
  fightLoadout,
  rpsLoadout,
  onFightChange,
  onRpsChange,
  disabled = false,
}: Props) {
  const fightComplete = FIGHT_MOVES.every((m) => Boolean(fightLoadout[m]))
  const rpsComplete = RPS_MOVES.every((m) => Boolean(rpsLoadout[m]))

  return (
    <section className="block">
      <h2>遊戲手勢配對</h2>
      <p className="hint">
        每個動作必須指定一個手勢。遊戲內不再顯示配置，開打時會直接使用這裡的設定。
      </p>

      <div className="loadout-settings">
        <div className="loadout-settings-group">
          <h3>
            手勢格鬥
            <span className={`loadout-status${fightComplete ? ' ok' : ''}`}>
              {fightComplete ? '已完成' : '未完成'}
            </span>
          </h3>
          {gestures.length === 0 ? (
            <p className="hint">請先錄製手勢。</p>
          ) : (
            <div className="loadout-settings-rows">
              {FIGHT_MOVES.map((move) => (
                <label key={move} className="loadout-settings-row">
                  <span>
                    <strong>{MOVE_LABELS[move]}</strong>
                    <small>{MOVE_HINTS[move]}</small>
                  </span>
                  <select
                    value={fightLoadout[move] ?? ''}
                    disabled={disabled}
                    onChange={(e) => onFightChange(move, e.target.value)}
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

        <div className="loadout-settings-group">
          <h3>
            包剪揼
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
