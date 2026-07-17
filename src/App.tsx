import { useCallback, useEffect, useRef, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { useHandLandmarker } from './hooks/useHandLandmarker'
import { createWorkspace, fetchGestures, pushGestures, verifyWorkspace } from './lib/api'
import { GestureMatcher } from './lib/matcher'
import { runReaction, stopReactions } from './lib/reactions'
import {
  createId,
  loadGestures,
  loadSyncKey,
  saveGesturesLocal,
  saveSyncKey,
} from './lib/storage'
import type { AppMode, HandFrame, Reaction, SavedGesture } from './types'
import './App.css'

const DEFAULT_REACTION: Reaction = {
  kind: 'speak',
  text: '哈囉，手勢認到喇',
}

type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'offline'

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
  const [syncKey, setSyncKey] = useState<string | null>(() => loadSyncKey())
  const [syncInput, setSyncInput] = useState('')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')

  const modeRef = useRef(mode)
  const gesturesRef = useRef(gestures)
  const syncKeyRef = useRef(syncKey)
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
    syncKeyRef.current = syncKey
    saveSyncKey(syncKey)
  }, [syncKey])

  const flash = useCallback((msg: string) => {
    setStatusMessage(msg)
    window.setTimeout(() => setStatusMessage(null), 2800)
  }, [])

  const pushToCloud = useCallback(
    async (nextGestures: SavedGesture[], key: string) => {
      setSyncStatus('syncing')
      try {
        await pushGestures(key, nextGestures)
        setSyncStatus('ok')
      } catch {
        setSyncStatus('error')
      }
    },
    [],
  )

  // Debounced cloud sync whenever gestures change
  useEffect(() => {
    if (!syncKey) return
    if (skipNextPush.current) {
      skipNextPush.current = false
      return
    }
    if (pushTimer.current) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      void pushToCloud(gestures, syncKey)
    }, 600)
    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current)
    }
  }, [gestures, syncKey, pushToCloud])

  // Load from DB on mount / when sync key set
  useEffect(() => {
    if (!syncKey) {
      setSyncStatus('offline')
      return
    }

    let cancelled = false
    ;(async () => {
      setSyncStatus('syncing')
      try {
        await verifyWorkspace(syncKey)
        const remote = await fetchGestures(syncKey)
        if (cancelled) return
        skipNextPush.current = true
        setGestures(remote)
        setSyncStatus('ok')
      } catch {
        if (!cancelled) {
          setSyncStatus('error')
          flash('無法連接資料庫，暫用本機資料')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [syncKey, flash])

  const onFrame = useCallback((frame: HandFrame | null) => {
    if (!frame) return

    if (modeRef.current === 'recording') {
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

  const onStartRecord = useCallback(async () => {
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
    flash(syncKeyRef.current ? `已儲存「${name}」並同步到資料庫` : `已儲存「${name}」（僅本機，請設定同步碼）`)
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
    setGestures((prev) => prev.filter((g) => g.id !== id))
    flash('已刪除手勢')
  }, [flash])

  const onUpdate = useCallback(
    (id: string, patch: { name: string; reaction: Reaction }) => {
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

  const onCreateSync = useCallback(async () => {
    setSyncStatus('syncing')
    try {
      const { syncKey: key } = await createWorkspace()
      // Upload current local gestures to the new workspace
      await pushGestures(key, gesturesRef.current)
      setSyncKey(key)
      setSyncStatus('ok')
      flash(`已建立同步碼 ${key}`)
    } catch (err) {
      setSyncStatus('error')
      flash(err instanceof Error ? err.message : '建立同步失敗')
    }
  }, [flash])

  const onJoinSync = useCallback(async () => {
    const key = syncInput.trim().toUpperCase()
    if (!/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(key)) {
      flash('同步碼格式應為 XXX-XXX-XXX')
      return
    }
    setSyncStatus('syncing')
    try {
      await verifyWorkspace(key)
      const remote = await fetchGestures(key)
      skipNextPush.current = true
      setGestures(remote)
      setSyncKey(key)
      setSyncStatus('ok')
      flash(`已加入同步 ${key}`)
    } catch (err) {
      setSyncStatus('error')
      flash(err instanceof Error ? err.message : '加入同步失敗')
    }
  }, [syncInput, flash])

  const onLeaveSync = useCallback(() => {
    setSyncKey(null)
    setSyncStatus('offline')
    flash('已解除雲端同步（本機資料仍保留）')
  }, [flash])

  const onPullSync = useCallback(async () => {
    if (!syncKey) return
    setSyncStatus('syncing')
    try {
      const remote = await fetchGestures(syncKey)
      skipNextPush.current = true
      setGestures(remote)
      setSyncStatus('ok')
      flash('已從資料庫重新下載')
    } catch (err) {
      setSyncStatus('error')
      flash(err instanceof Error ? err.message : '下載失敗')
    }
  }, [syncKey, flash])

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
              <p>設定同步碼後，手勢會存進資料庫，換裝置也能用。</p>
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
        syncKey={syncKey}
        syncStatus={syncStatus}
        syncInput={syncInput}
        onSyncInputChange={setSyncInput}
        onCreateSync={() => void onCreateSync()}
        onJoinSync={() => void onJoinSync()}
        onLeaveSync={onLeaveSync}
        onPullSync={() => void onPullSync()}
      />
    </div>
  )
}
