import { useState } from 'react'
import { LoadoutSettings } from './LoadoutSettings'
import { setAdminPassword } from '../lib/api'
import { MAX_SAMPLES, sampleCount } from '../lib/gestureSamples'
import { saveAdminPassword } from '../lib/storage'
import type { MoveLoadout, MoveType } from '../game/types'
import type { RpsLoadout, RpsMove } from '../game/rpsTypes'
import type { AppMode, MatchResult, SavedGesture } from '../types'

type Props = {
  mode: AppMode
  recordingCount: number
  statusMessage: string | null
  dbStatus: 'loading' | 'ok' | 'error' | 'saving'
  onReloadDb: () => void
  draftName: string
  onDraftNameChange: (v: string) => void
  onStartRecord: () => void
  onStopRecord: () => void
  canSave: boolean
  onSave: () => void
  trainTargetId: string | null
  trainTargetName: string | null
  onAddSample: () => void
  onStartTrain: (id: string) => void
  onCancelTrain: () => void
  onStartListen: () => void
  onStopListen: () => void
  lastMatch: MatchResult | null
  fightLoadout: MoveLoadout
  rpsLoadout: RpsLoadout
  onFightLoadoutChange: (move: MoveType, gestureId: string) => void
  onRpsLoadoutChange: (move: RpsMove, gestureId: string) => void
  gestures: SavedGesture[]
  onDelete: (id: string) => void
  onUpdate: (id: string, name: string) => void
}

export function ControlPanel({
  mode,
  recordingCount,
  statusMessage,
  dbStatus,
  onReloadDb,
  draftName,
  onDraftNameChange,
  onStartRecord,
  onStopRecord,
  canSave,
  onSave,
  trainTargetId,
  trainTargetName,
  onAddSample,
  onStartTrain,
  onCancelTrain,
  onStartListen,
  onStopListen,
  lastMatch,
  fightLoadout,
  rpsLoadout,
  onFightLoadoutChange,
  onRpsLoadoutChange,
  gestures,
  onDelete,
  onUpdate,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const startEdit = (g: SavedGesture) => {
    setEditingId(g.id)
    setEditName(g.name)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = () => {
    if (!editingId) return
    onUpdate(editingId, editName)
    setEditingId(null)
  }

  const dbLabel =
    dbStatus === 'loading'
      ? '載入中…'
      : dbStatus === 'saving'
        ? '同步中…'
        : dbStatus === 'ok'
          ? '已連線'
          : '連線失敗'

  const isTraining = Boolean(trainTargetId)
  const isListening = mode === 'listening'
  const isRecording = mode === 'recording'
  const busy = isListening || isRecording

  const modeLabel =
    mode === 'recording'
      ? `錄製中 · ${recordingCount} 幀`
      : mode === 'listening'
        ? '測試中'
        : '待命'

  return (
    <aside className="panel">
      <header className="panel-brand">
        <p className="eyebrow">設定</p>
        <h1>手勢管理</h1>
        <p className="lede">錄製與管理共用資料庫手勢，供所有遊戲使用。</p>
        <p className="hint">
          <a href="/">← 返回主頁</a>
          {' · '}
          <button
            type="button"
            className="text-btn inline"
            onClick={() => {
              saveAdminPassword(null)
              setAdminPassword(null)
              window.location.href = '/'
            }}
          >
            登出
          </button>
        </p>
      </header>

      <div className="status-row" aria-live="polite">
        <span className={`pill mode-${mode}`}>{modeLabel}</span>
        <span
          className={`pill ${dbStatus === 'ok' ? 'on' : ''} ${dbStatus === 'error' ? 'mode-recording' : ''}`}
        >
          {dbLabel}
        </span>
      </div>

      {statusMessage && <p className="flash">{statusMessage}</p>}

      <section className="block">
        <h2>測試手勢</h2>
        <p className="hint">開啟相機即時比對已儲存手勢，確認辨識是否準確。</p>
        <div className="actions">
          {!isListening ? (
            <button
              type="button"
              className="primary"
              disabled={gestures.length === 0 || isRecording}
              onClick={onStartListen}
            >
              開始測試
            </button>
          ) : (
            <button type="button" className="danger" onClick={onStopListen}>
              停止測試
            </button>
          )}
        </div>
        {lastMatch && (
          <p className="flash success">
            最近辨識：{lastMatch.gestureName}（{Math.round(lastMatch.score * 100)}%）
          </p>
        )}
      </section>

      <section className="block">
        <h2>{isTraining ? `加訓練：${trainTargetName}` : '錄製手勢'}</h2>
        <p className="hint">
          {isTraining
            ? `再錄一次「${trainTargetName}」，加入樣本可提升辨識率（最多 ${MAX_SAMPLES} 樣本）。`
            : '儲存後會自動同步到資料庫。也可對已有手勢按「加訓練」重複錄製。'}
        </p>
        {!isTraining && (
          <label className="field">
            <span>名稱</span>
            <input
              value={draftName}
              onChange={(e) => onDraftNameChange(e.target.value)}
              placeholder="例如：握拳、剪刀手"
              disabled={busy}
            />
          </label>
        )}

        <div className="actions">
          {!isRecording ? (
            <button type="button" className="primary" disabled={isListening} onClick={onStartRecord}>
              開始錄製
            </button>
          ) : (
            <button type="button" className="danger" onClick={onStopRecord}>
              停止並預覽
            </button>
          )}
          {isTraining ? (
            <>
              <button
                type="button"
                className="secondary"
                disabled={!canSave || busy}
                onClick={onAddSample}
              >
                加入訓練
              </button>
              <button type="button" className="text-btn" disabled={busy} onClick={onCancelTrain}>
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="secondary"
              disabled={!canSave || busy}
              onClick={onSave}
            >
              儲存到手勢庫
            </button>
          )}
        </div>
      </section>

      <LoadoutSettings
        gestures={gestures}
        fightLoadout={fightLoadout}
        rpsLoadout={rpsLoadout}
        onFightChange={onFightLoadoutChange}
        onRpsChange={onRpsLoadoutChange}
        disabled={busy}
      />

      <section className="block">
        <div className="block-head">
          <h2>已儲存（{gestures.length}）</h2>
          <button
            type="button"
            className="text-btn"
            onClick={onReloadDb}
            disabled={dbStatus === 'loading'}
          >
            重新載入
          </button>
        </div>
        {gestures.length === 0 ? (
          <p className="hint">還沒有手勢，請先錄製並儲存。</p>
        ) : (
          <ul className="gesture-list">
            {gestures.map((g) => {
              const isEditing = editingId === g.id
              const samples = sampleCount(g)
              const atLimit = samples >= MAX_SAMPLES
              const matched = lastMatch?.gestureId === g.id
              return (
                <li
                  key={g.id}
                  className={
                    isEditing
                      ? 'editing'
                      : trainTargetId === g.id
                        ? 'training'
                        : matched
                          ? 'matched'
                          : ''
                  }
                >
                  {isEditing ? (
                    <div className="edit-form">
                      <label className="field">
                        <span>名稱</span>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="手勢名稱"
                        />
                      </label>
                      <div className="actions">
                        <button type="button" className="primary" onClick={saveEdit}>
                          儲存修改
                        </button>
                        <button type="button" className="secondary" onClick={cancelEdit}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <strong>
                          {g.name}
                          {matched ? ' ✓' : ''}
                        </strong>
                        <span>
                          {samples} 樣本 · {g.frames.length} 幀
                          {atLimit ? '（已滿）' : ''}
                          {matched ? ` · ${Math.round(lastMatch.score * 100)}%` : ''}
                        </span>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          disabled={atLimit || busy}
                          onClick={() => onStartTrain(g.id)}
                        >
                          加訓練
                        </button>
                        <button type="button" disabled={busy} onClick={() => startEdit(g)}>
                          改名
                        </button>
                        <button
                          type="button"
                          className="danger-text"
                          disabled={busy}
                          onClick={() => onDelete(g.id)}
                        >
                          刪除
                        </button>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </aside>
  )
}
