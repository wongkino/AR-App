import { useCallback, useEffect, useRef, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { useHandLandmarker } from './hooks/useHandLandmarker'
import {
  fetchGestures,
  pushGestures,
  setAdminPassword,
  verifyAdminPassword,
} from './lib/api'
import { GestureMatcher } from './lib/matcher'
import { runReaction, stopReactions } from './lib/reactions'
import {
  createId,
  loadAdminPassword,
  loadGestures,
  saveAdminPassword,
  saveGesturesLocal,
} from './lib/storage'
import type { AppMode, HandFrame, Reaction, SavedGesture } from './types'
import './App.css'

const DEFAULT_REACTION: Reaction = {
  kind: 'speak',
  text: '哈囉，手勢認到喇',
}

type DbStatus = 'loading' | 'ok' | 'error' | 'saving'

export default function App() {
  const [mode, setMode] = useState<AppMode>('idle')
  const [gestures, setGestures] = useState<SavedGesture[]>(() => loadGestures())
  const [draftName, setDraftName] = useState('')
  const [draftReaction, setDraftReaction] = useState<Reaction>(DEFAULT_REACTION)
  const [pendingFrames, setPendingFrames] = useState<HandFrame[] | null>(null)
  const [recordingCount, setRecordingCount] = useState(0)
  const [lastTriggered, setLastTriggered] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [dbStatus, setDbStatus] = useState<DbStatus>('loading')
  const [canEdit, setCanEdit] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')

  const modeRef = useRef(mode)
  const gesturesRef = useRef(gestures)
  const canEditRef = useRef(canEdit)
  const recordBuf = useRef<HandFrame[]>([])
  const matcherRef = useRef(new GestureMatcher())
  const triggeringRef = useRef(false)
  const skipNextPush = useRef(false)
  const pushTimer = useRef<number | null>(null)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    gesturesRef.current = gestures
    saveGesturesLocal(gestures)
  }, [gestures])

  useEffect(() => {
    canEditRef.current = canEdit
  }, [canEdit])

  const flash = useCallback((msg: string) => {
    setStatusMessage(msg)
    window.setTimeout(() => setStatusMessage(null), 2800)
  }, [])

  const reloadFromDb = useCallback(async () => {
    setDbStatus('loading')
    try {
      const remote = await fetchGestures()
      skipNextPush.current = true
      setGestures(remote)
      setDbStatus('ok')
    } catch (err) {
      setDbStatus('error')
      flash(err instanceof Error ? err.message : '無法從資料庫載入')
    }
  }, [flash])

  useEffect(() => {
    void reloadFromDb()
  }, [reloadFromDb])

  useEffect(() => {
    const saved = loadAdminPassword()
    if (!saved) return
    ;(async () => {
      try {
        await verifyAdminPassword(saved)
        setAdminPassword(saved)
        setCanEdit(true)
      } catch {
        saveAdminPassword(null)
        setAdminPassword(null)
      }
    })()
  }, [])

  // Admin edits → write to DB
  useEffect(() => {
    if (!canEdit) return
    if (skipNextPush.current) {
      skipNextPush.current = false
      return
    }
    if (pushTimer.current) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      void (async () => {
        setDbStatus('saving')
        try {
          await pushGestures(gestures)
          setDbStatus('ok')
        } catch {
          setDbStatus('error')
        }
      })()
    }, 600)
    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current)
    }
  }, [gestures, canEdit])

  const onFrame = useCallback((frame: HandFrame | null) => {
    if (!frame) return

    if (modeRef.current === 'recording') {
      if (!canEditRef.current) return
      recordBuf.current.push(frame)
      setRecordingCount(recordBuf.current.length)
      return
    }

    if (modeRef.current === 'listening') {
      const matcher = matcherRef.current
      matcher.push(frame)
      if (triggeringRef.current) return
      const match = matcher.tryMatch(gesturesRef.current)
      if (!match) return

      const gesture = gesturesRef.current.find((g) => g.id === match.gestureId)
      if (!gesture) return

      setLastTriggered(`${gesture.name}（${Math.round(match.score * 100)}%）`)
      triggeringRef.current = true
      void runReaction(gesture.reaction)
        .catch((err: unknown) => {
          setStatusMessage(err instanceof Error ? err.message : '觸發反應失敗')
        })
        .finally(() => {
          triggeringRef.current = false
        })
    }
  }, [])

  const {
    videoRef,
    canvasRef,
    ready,
    error,
    handCount,
    startCamera,
    stopCamera,
  } = useHandLandmarker(onFrame)

  const ensureCamera = useCallback(async () => {
    if (cameraOn) return
    await startCamera()
    setCameraOn(true)
  }, [cameraOn, startCamera])

  const onUnlock = useCallback(async () => {
    const password = passwordInput.trim()
    if (!password) {
      flash('請輸入管理密碼')
      return
    }
    try {
      await verifyAdminPassword(password)
      setAdminPassword(password)
      saveAdminPassword(password)
      setCanEdit(true)
      setPasswordInput('')
      flash('已解鎖編輯模式')
    } catch (err) {
      flash(err instanceof Error ? err.message : '密碼錯誤')
    }
  }, [passwordInput, flash])

  const onLock = useCallback(() => {
    setAdminPassword(null)
    saveAdminPassword(null)
    setCanEdit(false)
    setPendingFrames(null)
    if (modeRef.current === 'recording') {
      recordBuf.current = []
      setMode('idle')
    }
    flash('已鎖定，現在只能監聽')
  }, [flash])

  const onStartRecord = useCallback(async () => {
    if (!canEditRef.current) {
      flash('請先輸入管理密碼')
      return
    }
    stopReactions()
    matcherRef.current.clear()
    setLastTriggered(null)
    setPendingFrames(null)
    recordBuf.current = []
    setRecordingCount(0)
    setMode('recording')
    await ensureCamera()
    flash('開始錄製，請對鏡頭做完一整段手勢')
  }, [ensureCamera, flash])

  const onStopRecord = useCallback(() => {
    const frames = [...recordBuf.current]
    recordBuf.current = []
    setMode('idle')
    if (frames.length < 10) {
      setPendingFrames(null)
      flash('錄得太短，請至少做約半秒以上的手勢')
      return
    }
    setPendingFrames(frames)
    flash(`已擷取 ${frames.length} 幀，可按「儲存手勢」`)
  }, [flash])

  const onSave = useCallback(() => {
    if (!canEditRef.current) {
      flash('請先輸入管理密碼')
      return
    }
    if (!pendingFrames || pendingFrames.length < 10) {
      flash('請先錄製一段手勢')
      return
    }
    const name = draftName.trim() || `手勢 ${gestures.length + 1}`
    if (draftReaction.kind === 'speak' && !draftReaction.text.trim()) {
      flash('請填寫要朗讀的文字')
      return
    }
    if (draftReaction.kind === 'play' && !draftReaction.url.trim()) {
      flash('請填寫音訊網址')
      return
    }

    const next: SavedGesture = {
      id: createId(),
      name,
      frames: pendingFrames,
      reaction:
        draftReaction.kind === 'speak'
          ? { kind: 'speak', text: draftReaction.text.trim() }
          : { kind: 'play', url: draftReaction.url.trim(), label: draftReaction.label },
      createdAt: Date.now(),
    }

    setGestures((prev) => [next, ...prev])
    setPendingFrames(null)
    setDraftName('')
    setDraftReaction(DEFAULT_REACTION)
    flash(`已儲存「${name}」到資料庫`)
  }, [pendingFrames, draftName, draftReaction, gestures.length, flash])

  const onStartListen = useCallback(async () => {
    stopReactions()
    matcherRef.current.clear()
    setLastTriggered(null)
    setMode('listening')
    await ensureCamera()
    flash('監聽中，重複已儲存的手勢即可觸發')
  }, [ensureCamera, flash])

  const onStopListen = useCallback(() => {
    setMode('idle')
    matcherRef.current.clear()
    stopReactions()
    flash('已停止監聽')
  }, [flash])

  const onDelete = useCallback((id: string) => {
    if (!canEditRef.current) return
    setGestures((prev) => prev.filter((g) => g.id !== id))
    flash('已刪除手勢')
  }, [flash])

  const onUpdate = useCallback(
    (id: string, patch: { name: string; reaction: Reaction }) => {
      if (!canEditRef.current) return
      setGestures((prev) =>
        prev.map((g) => (g.id === id ? { ...g, name: patch.name, reaction: patch.reaction } : g)),
      )
      flash('已更新反應')
    },
    [flash],
  )

  const onTest = useCallback(
    (g: SavedGesture) => {
      void runReaction(g.reaction).catch((err: unknown) => {
        flash(err instanceof Error ? err.message : '試播失敗')
      })
    },
    [flash],
  )

  useEffect(() => {
    return () => {
      stopCamera()
      stopReactions()
    }
  }, [stopCamera])

  return (
    <div className="app">
      <div className="stage">
        <div className="stage-bg" aria-hidden />
        <div className="viewport">
          {!cameraOn && (
            <div className="camera-gate">
              <h2>開啟鏡頭開始</h2>
              <p>手勢直接存於資料庫。一般可監聽；錄製需管理密碼。</p>
              <button
                type="button"
                className="primary"
                disabled={!ready}
                onClick={() => void ensureCamera()}
              >
                {ready ? '開啟相機' : '載入模型中…'}
              </button>
            </div>
          )}
          <video ref={videoRef} className="cam" playsInline muted autoPlay />
          <canvas ref={canvasRef} className="overlay" />
          {mode === 'recording' && <div className="rec-badge">REC</div>}
          {mode === 'listening' && <div className="listen-badge">LISTEN</div>}
        </div>
        {(error || (!ready && !error)) && (
          <p className="stage-note">
            {error ?? '正在載入 MediaPipe 手勢模型…'}
          </p>
        )}
      </div>

      <ControlPanel
        mode={mode}
        recordingCount={recordingCount}
        handCount={handCount}
        lastTriggered={lastTriggered}
        statusMessage={statusMessage}
        canEdit={canEdit}
        passwordInput={passwordInput}
        onPasswordInputChange={setPasswordInput}
        onUnlock={() => void onUnlock()}
        onLock={onLock}
        dbStatus={dbStatus}
        onReloadDb={() => void reloadFromDb()}
        draftName={draftName}
        draftReaction={draftReaction}
        onDraftNameChange={setDraftName}
        onDraftReactionChange={setDraftReaction}
        onStartRecord={() => void onStartRecord()}
        onStopRecord={onStopRecord}
        onStartListen={() => void onStartListen()}
        onStopListen={onStopListen}
        canSave={!!pendingFrames && pendingFrames.length >= 10}
        onSave={onSave}
        gestures={gestures}
        onDelete={onDelete}
        onTest={onTest}
        onUpdate={onUpdate}
      />
    </div>
  )
}
