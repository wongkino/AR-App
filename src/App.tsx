import { useCallback, useEffect, useRef, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { useHandLandmarker } from './hooks/useHandLandmarker'
import { fetchGestures, pushGestures } from './lib/api'
import {
  createId,
  loadGestures,
  mergeRemoteGestures,
  saveGesturesLocal,
  sharedGesturesForDb,
} from './lib/storage'
import type { AppMode, HandFrame, SavedGesture } from './types'
import './App.css'

const DEFAULT_REACTION = {
  kind: 'speak' as const,
  text: '手勢',
}

type DbStatus = 'loading' | 'ok' | 'error' | 'saving'

export default function App() {
  const [mode, setMode] = useState<AppMode>('idle')
  const [gestures, setGestures] = useState<SavedGesture[]>(() => loadGestures())
  const [draftName, setDraftName] = useState('')
  const [pendingFrames, setPendingFrames] = useState<HandFrame[] | null>(null)
  const [recordingCount, setRecordingCount] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [dbStatus, setDbStatus] = useState<DbStatus>('loading')

  const modeRef = useRef(mode)
  const gesturesRef = useRef(gestures)
  const recordBuf = useRef<HandFrame[]>([])
  const skipNextPush = useRef(false)
  const pushTimer = useRef<number | null>(null)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    gesturesRef.current = gestures
    saveGesturesLocal(gestures)
  }, [gestures])

  const flash = useCallback((msg: string) => {
    setStatusMessage(msg)
    window.setTimeout(() => setStatusMessage(null), 2800)
  }, [])

  const reloadFromDb = useCallback(async () => {
    setDbStatus('loading')
    try {
      const remote = await fetchGestures()
      skipNextPush.current = true
      setGestures((prev) => mergeRemoteGestures(remote, prev))
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
    if (skipNextPush.current) {
      skipNextPush.current = false
      return
    }
    if (pushTimer.current) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      void (async () => {
        setDbStatus('saving')
        try {
          await pushGestures(sharedGesturesForDb(gestures))
          setDbStatus('ok')
        } catch {
          setDbStatus('error')
        }
      })()
    }, 600)
    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current)
    }
  }, [gestures])

  const onFrame = useCallback((frame: HandFrame | null) => {
    if (!frame || modeRef.current !== 'recording') return
    recordBuf.current.push(frame)
    setRecordingCount(recordBuf.current.length)
  }, [])

  const { videoRef, canvasRef, ready, error, startCamera, stopCamera } = useHandLandmarker(onFrame)

  const ensureCamera = useCallback(async () => {
    if (cameraOn) return
    await startCamera()
    setCameraOn(true)
  }, [cameraOn, startCamera])

  const onStartRecord = useCallback(async () => {
    setPendingFrames(null)
    recordBuf.current = []
    setRecordingCount(0)
    setMode('recording')
    await ensureCamera()
    window.requestAnimationFrame(() => {
      document.getElementById('camera-viewport')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
    flash('開始錄製手勢')
  }, [ensureCamera, flash])

  const onStopRecord = useCallback(() => {
    const frames = [...recordBuf.current]
    recordBuf.current = []
    setMode('idle')
    stopCamera()
    setCameraOn(false)
    if (frames.length < 10) {
      setPendingFrames(null)
      flash('錄得太短，請至少做約半秒以上的手勢')
      return
    }
    setPendingFrames(frames)
    flash(`已擷取 ${frames.length} 幀，可按「儲存到手勢庫」`)
  }, [flash, stopCamera])

  const onSave = useCallback(() => {
    if (!pendingFrames || pendingFrames.length < 10) {
      flash('請先錄製一段手勢')
      return
    }
    const name = draftName.trim() || `手勢 ${gestures.length + 1}`
    const next: SavedGesture = {
      id: createId(),
      name,
      frames: pendingFrames,
      reaction: DEFAULT_REACTION,
      createdAt: Date.now(),
    }
    setGestures((prev) => [next, ...prev])
    setPendingFrames(null)
    setDraftName('')
    flash(`已儲存「${name}」到手勢庫`)
  }, [pendingFrames, draftName, gestures.length, flash])

  const onDelete = useCallback(
    (id: string) => {
      setGestures((prev) => prev.filter((g) => g.id !== id))
      flash('已刪除手勢')
    },
    [flash],
  )

  const onUpdate = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      setGestures((prev) => prev.map((g) => (g.id === id ? { ...g, name: trimmed } : g)))
      flash('已更新名稱')
    },
    [flash],
  )

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  return (
    <div className={`app${mode === 'recording' ? ' is-recording' : ''}`}>
      <div className="stage">
        <div className="stage-bg" aria-hidden />
        <div className="viewport" id="camera-viewport">
          {mode !== 'recording' && (
            <div className="camera-gate">
              <h2>手勢錄製</h2>
              <p>按「開始錄製」後會開啟相機，完成手勢後停止並儲存。</p>
            </div>
          )}
          {mode === 'recording' && (
            <>
              {!cameraOn && (
                <div className="camera-gate">
                  <h2>{ready ? '正在開啟相機…' : '載入模型中…'}</h2>
                </div>
              )}
              <video
                ref={videoRef}
                className="cam"
                playsInline
                muted
                autoPlay
                disablePictureInPicture
              />
              <canvas ref={canvasRef} className="overlay" />
              <div className="rec-badge">REC · {recordingCount}</div>
              <button type="button" className="rec-stop" onClick={onStopRecord}>
                停止並預覽
              </button>
            </>
          )}
        </div>
        {error && <p className="stage-note">{error}</p>}
      </div>

      <ControlPanel
        mode={mode}
        recordingCount={recordingCount}
        statusMessage={statusMessage}
        dbStatus={dbStatus}
        onReloadDb={() => void reloadFromDb()}
        draftName={draftName}
        onDraftNameChange={setDraftName}
        onStartRecord={() => void onStartRecord()}
        onStopRecord={onStopRecord}
        canSave={!!pendingFrames && pendingFrames.length >= 10}
        onSave={onSave}
        gestures={gestures}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />
    </div>
  )
}
