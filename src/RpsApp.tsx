import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RpsArena } from './components/rps/RpsArena'
import { RpsLobby } from './components/rps/RpsLobby'
import { useHandLandmarker } from './hooks/useHandLandmarker'
import { fetchGestures, fetchLoadouts } from './lib/api'
import { gestureTemplates } from './lib/gestureSamples'
import { RpsGestureMatcher } from './lib/rpsMatcher'
import { RpsSocket } from './lib/rpsSocket'
import { playCountdownTick, playDraw, playLose, playWin, unlockSfx } from './lib/sfx'
import {
  EMPTY_RPS_LOADOUT,
  isRpsLoadoutComplete,
  sanitizeRpsLoadout,
} from './lib/loadoutStorage'
import { loadGestures, mergeRemoteGestures } from './lib/storage'
import type { PublicRpsRoom, RpsLoadout, RpsMove } from './game/rpsTypes'
import { RPS_LABELS } from './game/rpsTypes'
import type { HandFrame, SavedGesture } from './types'
import './RpsApp.css'

export default function RpsApp() {
  const [gestures, setGestures] = useState<SavedGesture[]>(() => loadGestures())
  const [room, setRoom] = useState<PublicRpsRoom | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('玩家')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [loadout, setLoadout] = useState<RpsLoadout>(() => ({ ...EMPTY_RPS_LOADOUT }))
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flashMove, setFlashMove] = useState<RpsMove | null>(null)

  const socketRef = useRef(new RpsSocket())
  const matcherRef = useRef(new RpsGestureMatcher())
  const roomRef = useRef(room)
  const playerIdRef = useRef(playerId)
  const loadoutRef = useRef(loadout)
  const throwingRef = useRef(false)

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    playerIdRef.current = playerId
  }, [playerId])

  useEffect(() => {
    loadoutRef.current = loadout
  }, [loadout])

  const gestureFrames = useMemo(() => {
    const map = new Map<string, ReturnType<typeof gestureTemplates>>()
    for (const g of gestures) map.set(g.id, gestureTemplates(g))
    return map
  }, [gestures])

  const loadoutReady = isRpsLoadoutComplete(loadout)

  useEffect(() => {
    void (async () => {
      try {
        const [remote, loadouts] = await Promise.all([fetchGestures(), fetchLoadouts()])
        setGestures((prev) => {
          const merged = mergeRemoteGestures(remote, prev)
          setLoadout(sanitizeRpsLoadout(loadouts.rps, merged))
          return merged
        })
      } catch {
        setGestures((prev) => {
          setLoadout(sanitizeRpsLoadout({ ...EMPTY_RPS_LOADOUT }, prev))
          return prev
        })
      }
    })()
  }, [])

  useEffect(() => {
    const socket = socketRef.current
    socket.connect({
      onOpen: () => {
        setConnected(true)
        setError(null)
      },
      onJoined: (nextRoom, id) => {
        setRoom(nextRoom)
        setPlayerId(id)
        setError(null)
      },
      onRoomUpdate: (nextRoom) => {
        setRoom(nextRoom)
        setError(null)
        if (nextRoom.roundPhase !== 'countdown') {
          setCountdown(null)
        }
      },
      onRoundTick: (value) => {
        setCountdown(value)
        playCountdownTick(value)
      },
      onRoundResult: (payload) => {
        setRoom(payload.room)
        const { result, room: nextRoom } = payload
        const meId = playerIdRef.current
        if (!meId) return
        if (result.winnerId === 'draw' || result.winnerId === null) {
          playDraw()
        } else if (result.winnerId === meId || nextRoom.winnerId === meId) {
          playWin()
        } else {
          playLose()
        }
      },
      onError: (message) => setError(message),
      onClose: () => setConnected(false),
    })

    return () => socket.disconnect()
  }, [])

  const onFrame = useCallback(
    (frame: HandFrame | null) => {
      if (!frame) return
      const currentRoom = roomRef.current
      if (!currentRoom || currentRoom.phase !== 'playing' || currentRoom.roundPhase !== 'throwing') {
        return
      }

      const me = currentRoom.players.find((p) => p.id === playerIdRef.current)
      if (me?.locked) return

      const matcher = matcherRef.current
      matcher.push(frame)
      if (throwingRef.current) return

      const match = matcher.tryMatch(loadoutRef.current, gestureFrames)
      if (!match) return

      throwingRef.current = true
      setFlashMove(match.move)
      socketRef.current.throwMove(match.move, match.gestureId, match.score)
      window.setTimeout(() => {
        throwingRef.current = false
        setFlashMove(null)
      }, 600)
    },
    [gestureFrames],
  )

  const { videoRef, canvasRef, ready, error: cameraError, handCount, startCamera, stopCamera } =
    useHandLandmarker(onFrame)

  const ensureCamera = useCallback(async () => {
    if (cameraOn) return
    await startCamera()
    setCameraOn(true)
  }, [cameraOn, startCamera])

  useEffect(() => {
    if (room?.phase === 'playing') {
      matcherRef.current.clear()
      void ensureCamera()
    }
  }, [room?.phase, room?.round, ensureCamera])

  useEffect(() => () => stopCamera(), [stopCamera])

  const me = room?.players.find((p) => p.id === playerId) ?? null
  const opponent = room?.players.find((p) => p.id !== playerId) ?? null

  const onCreateRoom = () => {
    const code = roomCodeInput.trim()
    if (!/^[A-Za-z0-9]{4}$/.test(code)) {
      setError('請輸入四位英數房間代碼')
      return
    }
    setError(null)
    void unlockSfx()
    socketRef.current.join(code, playerName.trim() || '玩家', true)
  }

  const onJoinRoom = () => {
    const code = roomCodeInput.trim()
    if (!/^[A-Za-z0-9]{4}$/.test(code)) {
      setError('請輸入四位英數房間代碼')
      return
    }
    setError(null)
    void unlockSfx()
    socketRef.current.join(code, playerName.trim() || '玩家')
  }

  const onReady = () => {
    if (!isRpsLoadoutComplete(loadout)) {
      setError('共用手勢配對尚未完成，請管理員到設定頁設定')
      return
    }
    setError(null)
    void unlockSfx()
    socketRef.current.ready(loadout)
  }

  return (
    <div className="rps-app">
      <div className="rps-stage">
        <div className="rps-viewport">
          {!cameraOn && (
            <div className="rps-camera-gate">
              <h2>{ready ? '對戰需要相機' : '載入模型中…'}</h2>
              <p>開打後會自動開啟相機。倒數結束後對住鏡頭做 {RPS_LABELS.rock}／{RPS_LABELS.scissors}／{RPS_LABELS.paper}。</p>
              {room?.phase === 'playing' && (
                <button
                  type="button"
                  className="primary"
                  disabled={!ready}
                  onClick={() => {
                    void unlockSfx()
                    void ensureCamera()
                  }}
                >
                  開啟相機
                </button>
              )}
            </div>
          )}
          <video ref={videoRef} className="rps-cam" playsInline muted autoPlay disablePictureInPicture />
          <canvas ref={canvasRef} className="rps-overlay" />
          {room?.phase === 'playing' && <div className="rps-live-badge">LIVE</div>}
        </div>

        {cameraError && <p className="rps-stage-note">{cameraError}</p>}

        {room?.phase === 'playing' && (
          <RpsArena
            room={room}
            me={me}
            opponent={opponent}
            playerId={playerId}
            countdown={countdown}
            flashMove={flashMove}
          />
        )}

        {room?.phase === 'playing' && (
          <p className="rps-hand-hint">
            {handCount > 0 ? `偵測到 ${handCount} 隻手` : '請將手部放入鏡頭'}
          </p>
        )}
      </div>

      <RpsLobby
        room={room}
        playerId={playerId}
        playerName={playerName}
        roomCodeInput={roomCodeInput}
        loadout={loadout}
        gestures={gestures}
        loadoutReady={loadoutReady}
        connected={connected}
        error={error}
        onPlayerNameChange={setPlayerName}
        onRoomCodeInputChange={setRoomCodeInput}
        onCreateRoom={onCreateRoom}
        onJoinRoom={onJoinRoom}
        onReady={onReady}
        onRematch={() => {
          void unlockSfx()
          socketRef.current.rematch()
        }}
        onFormatChange={(format) => socketRef.current.setFormat(format)}
      />
    </div>
  )
}
