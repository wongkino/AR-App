import { useCallback, useEffect, useRef, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { useHandLandmarker } from './hooks/useHandLandmarker'
import { fetchGestures, pushGestures } from './lib/api'
import { MAX_SAMPLES, sampleCount } from './lib/gestureSamples'
import {
  loadFightLoadout,
  loadRpsLoadout,
  saveFightLoadout,
  saveRpsLoadout,
  sanitizeFightLoadout,
  sanitizeRpsLoadout,
} from './lib/loadoutStorage'
import { GestureMatcher } from './lib/matcher'
import {
  createId,
  loadGestures,
  mergeRemoteGestures,
  saveGesturesLocal,
  sharedGesturesForDb,
} from './lib/storage'
import type { MoveLoadout, MoveType } from './game/types'
import type { RpsLoadout, RpsMove } from './game/rpsTypes'
import type { AppMode, HandFrame, MatchResult, SavedGesture } from './types'
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
  const [trainTargetId, setTrainTargetId] = useState<string | null>(null)
  const [lastMatch, setLastMatch] = useState<MatchResult | null>(null)
  const [matchFlash, setMatchFlash] = useState<string | null>(null)
  const [fightLoadout, setFightLoadout] = useState<MoveLoadout>(() => loadFightLoadout())
  const [rpsLoadout, setRpsLoadout] = useState<RpsLoadout>(() => loadRpsLoadout())

  const modeRef = useRef(mode)
  const gesturesRef = useRef(gestures)
  const recordBuf = useRef<HandFrame[]>([])
  const matcherRef = useRef(new GestureMatcher())
  const skipNextPush = useRef(false)
  const pushTimer = useRef<number | null>(null)
  const matchFlashTimer = useRef<number | null>(null)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    gesturesRef.current = gestures
    saveGesturesLocal(gestures)
    setFightLoadout((prev) => {
      const next = sanitizeFightLoadout(prev, gestures)
      saveFightLoadout(next)
      return next
    })
    setRpsLoadout((prev) => {
      const next = sanitizeRpsLoadout(prev, gestures)
      saveRpsLoadout(next)
      return next
    })
  }, [gestures])

  const flash = useCallback((msg: string) => {
    setStatusMessage(msg)
    window.setTimeout(() => setStatusMessage(null), 2800)
  }, [])

  const trainTarget = trainTargetId
    ? (gestures.find((g) => g.id === trainTargetId) ?? null)
    : null

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
    if (!frame) return
    if (modeRef.current === 'recording') {
      recordBuf.current.push(frame)
      setRecordingCount(recordBuf.current.length)
      return
    }
    if (modeRef.current !== 'listening') return

    const matcher = matcherRef.current
    matcher.push(frame)
    const match = matcher.tryMatch(gesturesRef.current)
    if (!match) return

    setLastMatch(match)
    setMatchFlash(match.gestureName)
    if (matchFlashTimer.current) window.clearTimeout(matchFlashTimer.current)
    matchFlashTimer.current = window.setTimeout(() => setMatchFlash(null), 1400)
    flash(`辨識到「${match.gestureName}」（${Math.round(match.score * 100)}%）`)
  }, [flash])

  const { videoRef, canvasRef, ready, error, startCamera, stopCamera } = useHandLandmarker(onFrame)

  const ensureCamera = useCallback(async () => {
    if (cameraOn) return
    await startCamera()
    setCameraOn(true)
  }, [cameraOn, startCamera])

  const onStartRecord = useCallback(async () => {
    matcherRef.current.clear()
    setMatchFlash(null)
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
    flash(trainTargetId ? '開始加訓練樣本' : '開始錄製手勢')
  }, [ensureCamera, flash, trainTargetId])

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
    flash(
      trainTargetId
        ? `已擷取 ${frames.length} 幀，可按「加入訓練」`
        : `已擷取 ${frames.length} 幀，可按「儲存到手勢庫」`,
    )
  }, [flash, stopCamera, trainTargetId])

  const onStartListen = useCallback(async () => {
    if (gesturesRef.current.length === 0) {
      flash('請先儲存至少一個手勢')
      return
    }
    setPendingFrames(null)
    setTrainTargetId(null)
    matcherRef.current.clear()
    setLastMatch(null)
    setMatchFlash(null)
    setMode('listening')
    await ensureCamera()
    window.requestAnimationFrame(() => {
      document.getElementById('camera-viewport')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
    flash('測試中 — 對住鏡頭做手勢')
  }, [ensureCamera, flash])

  const onStopListen = useCallback(() => {
    matcherRef.current.clear()
    setMatchFlash(null)
    setMode('idle')
    stopCamera()
    setCameraOn(false)
    flash('已停止測試')
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
    setTrainTargetId(null)
    flash(`已儲存「${name}」到手勢庫`)
  }, [pendingFrames, draftName, gestures.length, flash])

  const onAddSample = useCallback(() => {
    if (!pendingFrames || pendingFrames.length < 10) {
      flash('請先錄製一段手勢')
      return
    }
    if (!trainTargetId) {
      flash('請先選擇要加訓練的手勢')
      return
    }
    const target = gesturesRef.current.find((g) => g.id === trainTargetId)
    if (!target) {
      flash('找不到該手勢')
      setTrainTargetId(null)
      return
    }
    if (sampleCount(target) >= MAX_SAMPLES) {
      flash(`每個手勢最多 ${MAX_SAMPLES} 個樣本`)
      return
    }
    setGestures((prev) =>
      prev.map((g) => {
        if (g.id !== trainTargetId) return g
        return {
          ...g,
          samples: [...(g.samples ?? []), pendingFrames],
        }
      }),
    )
    setPendingFrames(null)
    flash(`已加入「${target.name}」訓練（現共 ${sampleCount(target) + 1} 樣本）`)
  }, [pendingFrames, trainTargetId, flash])

  const onStartTrain = useCallback(
    (id: string) => {
      const target = gesturesRef.current.find((g) => g.id === id)
      if (!target) return
      if (sampleCount(target) >= MAX_SAMPLES) {
        flash(`「${target.name}」已達 ${MAX_SAMPLES} 樣本上限`)
        return
      }
      setTrainTargetId(id)
      setDraftName(target.name)
      setPendingFrames(null)
      flash(`已選「${target.name}」— 錄製後按「加入訓練」`)
    },
    [flash],
  )

  const onCancelTrain = useCallback(() => {
    setTrainTargetId(null)
    flash('已取消加訓練')
  }, [flash])

  const onDelete = useCallback(
    (id: string) => {
      setGestures((prev) => prev.filter((g) => g.id !== id))
      if (trainTargetId === id) setTrainTargetId(null)
      flash('已刪除手勢')
    },
    [flash, trainTargetId],
  )

  const onFightLoadoutChange = useCallback((move: MoveType, gestureId: string) => {
    setFightLoadout((prev) => {
      const next = { ...prev, [move]: gestureId || null }
      saveFightLoadout(next)
      return next
    })
  }, [])

  const onRpsLoadoutChange = useCallback((move: RpsMove, gestureId: string) => {
    setRpsLoadout((prev) => {
      const next = { ...prev, [move]: gestureId || null }
      saveRpsLoadout(next)
      return next
    })
  }, [])

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
    return () => {
      stopCamera()
      if (matchFlashTimer.current) window.clearTimeout(matchFlashTimer.current)
    }
  }, [stopCamera])

  const cameraActive = mode === 'recording' || mode === 'listening'

  return (
    <div className={`app${cameraActive ? ' is-recording' : ''}`}>
      <div className="stage">
        <div className="stage-bg" aria-hidden />
        <div className="viewport" id="camera-viewport">
          {!cameraActive && (
            <div className="camera-gate">
              <h2>
                {trainTarget
                  ? `加訓練：${trainTarget.name}`
                  : lastMatch
                    ? '測試手勢'
                    : '手勢錄製'}
              </h2>
              <p>
                {trainTarget
                  ? '再錄一次同一動作，加入樣本可提升辨識率。'
                  : '可錄製新手勢，或按「測試手勢」驗證辨識是否準確。'}
              </p>
            </div>
          )}
          {cameraActive && (
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
              {mode === 'recording' && <div className="rec-badge">REC · {recordingCount}</div>}
              {mode === 'listening' && <div className="listen-badge">TEST</div>}
              {matchFlash && <div className="match-flash">{matchFlash}</div>}
              {mode === 'recording' && (
                <button type="button" className="rec-stop" onClick={onStopRecord}>
                  停止並預覽
                </button>
              )}
              {mode === 'listening' && (
                <button type="button" className="listen-stop" onClick={onStopListen}>
                  停止測試
                </button>
              )}
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
        trainTargetId={trainTargetId}
        trainTargetName={trainTarget?.name ?? null}
        onAddSample={onAddSample}
        onStartTrain={onStartTrain}
        onCancelTrain={onCancelTrain}
        onStartListen={() => void onStartListen()}
        onStopListen={onStopListen}
        lastMatch={lastMatch}
        fightLoadout={fightLoadout}
        rpsLoadout={rpsLoadout}
        onFightLoadoutChange={onFightLoadoutChange}
        onRpsLoadoutChange={onRpsLoadoutChange}
        gestures={gestures}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />
    </div>
  )
}
