import { useState } from 'react'
import { setAdminPassword } from '../lib/api'
import { saveAdminPassword } from '../lib/storage'
import type { AppMode, SavedGesture } from '../types'

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
        <span className={`pill mode-${mode}`}>
          {mode === 'recording' ? `錄製中 · ${recordingCount} 幀` : '待命'}
        </span>
        <span
          className={`pill ${dbStatus === 'ok' ? 'on' : ''} ${dbStatus === 'error' ? 'mode-recording' : ''}`}
        >
          {dbLabel}
        </span>
      </div>

      {statusMessage && <p className="flash">{statusMessage}</p>}

      <section className="block">
        <h2>錄製手勢</h2>
        <p className="hint">儲存後會自動同步到資料庫，所有遊戲都可使用。</p>
        <label className="field">
          <span>名稱</span>
          <input
            value={draftName}
            onChange={(e) => onDraftNameChange(e.target.value)}
            placeholder="例如：握拳、剪刀手"
            disabled={mode === 'recording'}
          />
        </label>

        <div className="actions">
          {mode !== 'recording' ? (
            <button type="button" className="primary" onClick={onStartRecord}>
              開始錄製
            </button>
          ) : (
            <button type="button" className="danger" onClick={onStopRecord}>
              停止並預覽
            </button>
          )}
          <button
            type="button"
            className="secondary"
            disabled={!canSave || mode === 'recording'}
            onClick={onSave}
          >
            儲存到手勢庫
          </button>
        </div>
      </section>

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
              return (
                <li key={g.id} className={isEditing ? 'editing' : ''}>
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
                        <strong>{g.name}</strong>
                        <span>{g.frames.length} 幀</span>
                      </div>
                      <div className="row-actions">
                        <button type="button" onClick={() => startEdit(g)}>
                          改名
                        </button>
                        <button type="button" className="danger-text" onClick={() => onDelete(g.id)}>
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
