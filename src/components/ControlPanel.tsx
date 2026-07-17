import { useState } from 'react'
import type { AppMode, Reaction, SavedGesture } from '../types'

type Props = {
  mode: AppMode
  recordingCount: number
  handCount: number
  lastTriggered: string | null
  statusMessage: string | null
  canEdit: boolean
  passwordInput: string
  onPasswordInputChange: (v: string) => void
  onUnlock: () => void
  onLock: () => void
  dbStatus: 'loading' | 'ok' | 'error' | 'saving'
  onReloadDb: () => void
  draftName: string
  draftReaction: Reaction
  onDraftNameChange: (v: string) => void
  onDraftReactionChange: (v: Reaction) => void
  onStartRecord: () => void
  onStopRecord: () => void
  onStartListen: () => void
  onStopListen: () => void
  canSave: boolean
  onSave: () => void
  gestures: SavedGesture[]
  onDelete: (id: string) => void
  onTest: (g: SavedGesture) => void
  onUpdate: (id: string, patch: { name: string; reaction: Reaction }) => void
}

function reactionSummary(reaction: Reaction): string {
  if (reaction.kind === 'speak') {
    const t = reaction.text
    return `朗讀「${t.slice(0, 18)}${t.length > 18 ? '…' : ''}」`
  }
  return '播放音訊'
}

function ReactionEditor({
  value,
  onChange,
  disabled,
}: {
  value: Reaction
  onChange: (v: Reaction) => void
  disabled?: boolean
}) {
  return (
    <div className={`reaction-editor${disabled ? ' is-disabled' : ''}`} role="group" aria-label="反應">
      <p className="reaction-label">反應</p>
      <div className="seg" role="tablist" aria-label="反應類型">
        <button
          type="button"
          role="tab"
          aria-selected={value.kind === 'speak'}
          className={value.kind === 'speak' ? 'active' : ''}
          disabled={disabled}
          onClick={() =>
            onChange({
              kind: 'speak',
              text: value.kind === 'speak' ? value.text : '哈囉，手勢認到喇',
            })
          }
        >
          朗讀廣東話
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value.kind === 'play'}
          className={value.kind === 'play' ? 'active' : ''}
          disabled={disabled}
          onClick={() =>
            onChange({
              kind: 'play',
              url: value.kind === 'play' ? value.url : '',
              label: value.kind === 'play' ? value.label : '',
            })
          }
        >
          播放音訊
        </button>
      </div>

      {value.kind === 'speak' ? (
        <label className="field">
          <span>要朗讀嘅廣東話文字</span>
          <textarea
            rows={3}
            value={value.text}
            disabled={disabled}
            onChange={(e) => onChange({ kind: 'speak', text: e.target.value })}
            placeholder="觸發時會用粵語讀出嚟"
          />
        </label>
      ) : (
        <label className="field">
          <span>音訊網址（mp3 / wav）</span>
          <input
            value={value.url}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                kind: 'play',
                url: e.target.value,
                label: value.label,
              })
            }
            placeholder="https://example.com/song.mp3"
          />
        </label>
      )}
    </div>
  )
}

export function ControlPanel({
  mode,
  recordingCount,
  handCount,
  lastTriggered,
  statusMessage,
  canEdit,
  passwordInput,
  onPasswordInputChange,
  onUnlock,
  onLock,
  dbStatus,
  onReloadDb,
  draftName,
  draftReaction,
  onDraftNameChange,
  onDraftReactionChange,
  onStartRecord,
  onStopRecord,
  onStartListen,
  onStopListen,
  canSave,
  onSave,
  gestures,
  onDelete,
  onTest,
  onUpdate,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editReaction, setEditReaction] = useState<Reaction>({
    kind: 'speak',
    text: '',
  })

  const startEdit = (g: SavedGesture) => {
    setEditingId(g.id)
    setEditName(g.name)
    setEditReaction(g.reaction)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = () => {
    if (!editingId) return
    const name = editName.trim()
    if (!name) return
    if (editReaction.kind === 'speak' && !editReaction.text.trim()) return
    if (editReaction.kind === 'play' && !editReaction.url.trim()) return

    onUpdate(editingId, {
      name,
      reaction:
        editReaction.kind === 'speak'
          ? { kind: 'speak', text: editReaction.text.trim() }
          : { kind: 'play', url: editReaction.url.trim(), label: editReaction.label },
    })
    setEditingId(null)
  }

  const dbLabel =
    dbStatus === 'loading'
      ? '載入資料庫…'
      : dbStatus === 'saving'
        ? '寫入資料庫…'
        : dbStatus === 'ok'
          ? '已連線資料庫'
          : '資料庫連線失敗'

  return (
    <aside className="panel">
      <header className="panel-brand">
        <p className="eyebrow">Gesture Lab</p>
        <h1>用手勢觸發反應</h1>
        <p className="lede">
          手勢直接存在資料庫。一般模式只能監聽；輸入管理密碼後才能錄製與儲存。
        </p>
      </header>

      <div className="status-row" aria-live="polite">
        <span className={`pill ${handCount > 0 ? 'on' : ''}`}>
          {handCount === 0
            ? '等待手部'
            : handCount === 1
              ? '偵測到 1 隻手'
              : '偵測到 2 隻手'}
        </span>
        <span className={`pill mode-${mode}`}>
          {mode === 'recording'
            ? `錄製中 · ${recordingCount} 幀`
            : mode === 'listening'
              ? '監聽中'
              : '待命'}
        </span>
        <span className={`pill ${canEdit ? 'on' : ''}`}>
          {canEdit ? '編輯已解鎖' : '僅監聽'}
        </span>
        <span
          className={`pill ${dbStatus === 'ok' ? 'on' : ''} ${dbStatus === 'error' ? 'mode-recording' : ''}`}
        >
          {dbLabel}
        </span>
      </div>

      {statusMessage && <p className="flash">{statusMessage}</p>}
      {lastTriggered && mode === 'listening' && (
        <p className="flash success">觸發：{lastTriggered}</p>
      )}

      <section className="block">
        <h2>資料庫</h2>
        <p className="hint">所有裝置共用同一份手勢資料，開啟頁面會自動從資料庫載入。</p>
        <div className="actions">
          <button type="button" className="secondary" onClick={onReloadDb}>
            重新載入
          </button>
        </div>
      </section>

      <section className="block">
        <h2>管理密碼</h2>
        {canEdit ? (
          <>
            <p className="hint">已解鎖錄製／儲存／修改。關閉分頁會自動鎖定。</p>
            <div className="actions">
              <button type="button" className="danger" onClick={onLock}>
                鎖定編輯
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">輸入密碼後才能儲存手勢。預設密碼可用環境變數 ADMIN_PASSWORD 設定。</p>
            <label className="field">
              <span>密碼</span>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => onPasswordInputChange(e.target.value)}
                placeholder="管理密碼"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onUnlock()
                }}
              />
            </label>
            <div className="actions">
              <button type="button" className="primary" onClick={onUnlock}>
                解鎖編輯
              </button>
            </div>
          </>
        )}
      </section>

      <section className="block">
        <h2>監聽</h2>
        <p className="hint">開頁後會自動監聽。iPhone / iPad 需再點畫面「啟用語音」才會朗讀。</p>
        <div className="actions">
          {mode !== 'listening' ? (
            <button
              type="button"
              className="primary"
              onClick={onStartListen}
              disabled={gestures.length === 0 || mode === 'recording'}
            >
              開始監聽
            </button>
          ) : (
            <button type="button" className="danger" onClick={onStopListen}>
              停止監聽
            </button>
          )}
        </div>
      </section>

      {canEdit && (
        <section className="block">
          <h2>錄製手勢</h2>
          <label className="field">
            <span>名稱</span>
            <input
              value={draftName}
              onChange={(e) => onDraftNameChange(e.target.value)}
              placeholder="例如：揮手打招呼"
              disabled={mode === 'recording'}
            />
          </label>

          <ReactionEditor
            value={draftReaction}
            onChange={onDraftReactionChange}
            disabled={mode === 'recording'}
          />

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
              儲存手勢
            </button>
          </div>
        </section>
      )}

      <section className="block">
        <h2>已儲存（{gestures.length}）</h2>
        {gestures.length === 0 ? (
          <p className="hint">
            {canEdit
              ? '還沒有手勢。先錄一段並儲存。'
              : '資料庫尚無手勢。請管理員錄製後，再按「重新載入」。'}
          </p>
        ) : (
          <ul className="gesture-list">
            {gestures.map((g) => {
              const isEditing = canEdit && editingId === g.id
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
                      <ReactionEditor value={editReaction} onChange={setEditReaction} />
                      <div className="actions">
                        <button type="button" className="primary" onClick={saveEdit}>
                          儲存修改
                        </button>
                        <button type="button" className="secondary" onClick={cancelEdit}>
                          取消
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            onTest({ ...g, name: editName, reaction: editReaction })
                          }
                        >
                          試播
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <strong>{g.name}</strong>
                        <span>
                          {g.frames.length} 幀 · {reactionSummary(g.reaction)}
                        </span>
                      </div>
                      <div className="row-actions">
                        {canEdit && (
                          <button type="button" onClick={() => startEdit(g)}>
                            改反應
                          </button>
                        )}
                        <button type="button" onClick={() => onTest(g)}>
                          試播
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            className="danger-text"
                            onClick={() => onDelete(g.id)}
                          >
                            刪除
                          </button>
                        )}
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
