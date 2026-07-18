import { useCallback, useEffect, useRef, useState } from 'react'
import { FifteenArena } from './components/fifteen/FifteenArena'
import { FifteenLobby } from './components/fifteen/FifteenLobby'
import { useHandLandmarker } from './hooks/useHandLandmarker'
import { countFingers } from './lib/fingerCount'
import { FifteenSocket } from './lib/fifteenSocket'
import { FifteenSpeechListener, speechRecognitionSupported } from './lib/fifteenSpeech'
import { playCountdownTick, playDraw, playLose, playWin, unlockSfx } from './lib/sfx'
import type { FifteenCall, PublicFifteenRoom } from './game/fifteenTypes'
import type { HandFrame } from './types'
import './FifteenApp.css'

export default function FifteenApp() {
  const [room, setRoom] = useState<PublicFifteenRoom | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('玩家')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [liveCall, setLiveCall] = useState<FifteenCall | null>(null)
  const [liveFingers, setLiveFingers] = useState(0)
  const [speechOk] = useState(() => speechRecognitionSupported())

  const socketRef = useRef(new FifteenSocket())
  const speechRef = useRef(new FifteenSpeechListener())
  const roomRef = useRef(room)
  const playerIdRef = useRef(playerId)
  const liveCallRef = useRef(liveCall)
  const liveFingersRef = useRef(liveFingers)
  const lockedSentRef = useRef(false)
  const callAtRef = useRef<number | null>(null)
  const stableFingersRef = useRef<{ value: number; since: number } | null>(null)

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    playerIdRef.current = playerId
  }, [playerId])

  useEffect(() => {
    liveCallRef.current = liveCall
  }, [liveCall])

  useEffect(() => {
    liveFingersRef.current = liveFingers
  }, [liveFingers])

  const sendLock = useCallback((call: FifteenCall, fingers: number) => {
    const currentRoom = roomRef.current
    if (!currentRoom || currentRoom.phase !== 'playing' || currentRoom.roundPhase !== 'throwing') {
      return
    }
    const me = currentRoom.players.find((p) => p.id === playerIdRef.current)
    if (me?.locked || lockedSentRef.current) return

    lockedSentRef.current = true
    socketRef.current.lock(call, fingers)
    speechRef.current.stop()
  }, [])

  const setCall = useCallback((call: FifteenCall) => {
    setLiveCall(call)
    liveCallRef.current = call
    callAtRef.current = Date.now()
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
        if (nextRoom.roundPhase !== 'throwing') {
          lockedSentRef.current = false
          callAtRef.current = null
          stableFingersRef.current = null
        }
      },
      onRoundTick: (value) => {
        setCountdown(value)
        playCountdownTick(value)
      },
      onRoundResult: (payload) => {
        setRoom(payload.room)
        speechRef.current.stop()
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
      onError: (message) => {
        lockedSentRef.current = false
        setError(message)
      },
      onClose: () => setConnected(false),
    })

    return () => {
      speechRef.current.stop()
      socket.disconnect()
    }
  }, [])

  // Start / stop speech during throwing
  useEffect(() => {
    if (room?.phase !== 'playing' || room.roundPhase !== 'throwing') {
      speechRef.current.stop()
      if (room?.roundPhase !== 'throwing') {
        setLiveCall(null)
        lockedSentRef.current = false
        callAtRef.current = null
        stableFingersRef.current = null
      }
      return
    }

    const me = room.players.find((p) => p.id === playerId)
    if (me?.locked) {
      speechRef.current.stop()
      return
    }

    void unlockSfx()
    speechRef.current.start((call) => {
      setCall(call)
    })

    return () => speechRef.current.stop()
  }, [room?.phase, room?.roundPhase, room?.round, room?.players, playerId, setCall])

  const onFrame = useCallback(
    (frame: HandFrame | null) => {
      const fingers = countFingers(frame)
      setLiveFingers(fingers)

      const currentRoom = roomRef.current
      if (!currentRoom || currentRoom.phase !== 'playing' || currentRoom.roundPhase !== 'throwing') {
        return
      }
      const me = currentRoom.players.find((p) => p.id === playerIdRef.current)
      if (me?.locked || lockedSentRef.current) return

      const now = Date.now()
      const prev = stableFingersRef.current
      if (!prev || prev.value !== fingers) {
        stableFingersRef.current = { value: fingers, since: now }
      }

      const call = liveCallRef.current
      if (call == null || callAtRef.current == null) return

      const stable = stableFingersRef.current
      const fingersStable = stable != null && now - stable.since >= 350
      const callHeld = now - callAtRef.current >= 450
      const deadline = currentRoom.throwDeadline
      const nearEnd = deadline != null && deadline - now <= 500

      if ((fingersStable && callHeld) || nearEnd) {
        sendLock(call, fingers)
      }
    },
    [sendLock],
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
      void ensureCamera()
    }
  }, [room?.phase, room?.round, ensureCamera])

  useEffect(() => () => stopCamera(), [stopCamera])

  // Fallback lock near deadline even if camera frames stall
  useEffect(() => {
    if (room?.phase !== 'playing' || room.roundPhase !== 'throwing') return

    const id = window.setInterval(() => {
      const currentRoom = roomRef.current
      if (!currentRoom || currentRoom.roundPhase !== 'throwing') return
      const me = currentRoom.players.find((p) => p.id === playerIdRef.current)
      if (me?.locked || lockedSentRef.current) return
      const call = liveCallRef.current
      if (call == null) return
      const deadline = currentRoom.throwDeadline
      if (deadline != null && deadline - Date.now() <= 500) {
        sendLock(call, liveFingersRef.current)
      }
    }, 200)

    return () => window.clearInterval(id)
  }, [room?.phase, room?.roundPhase, room?.round, sendLock])

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
    setError(null)
    void unlockSfx()
    socketRef.current.ready()
  }

  const onPickCall = (call: FifteenCall) => {
    void unlockSfx()
    setCall(call)
  }

  return (
    <div className="fifteen-app">
      <div className="fifteen-stage">
        <div className="fifteen-viewport">
          {!cameraOn && (
            <div className="fifteen-camera-gate">
              <h2>{ready ? '對戰需要相機' : '載入模型中…'}</h2>
              <p>開打後會自動開啟相機。倒數結束後伸手指並叫數（5／10／15／20）。</p>
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
          <video ref={videoRef} className="fifteen-cam" playsInline muted autoPlay disablePictureInPicture />
          <canvas ref={canvasRef} className="fifteen-overlay" />
          {room?.phase === 'playing' && <div className="fifteen-live-badge">LIVE</div>}
        </div>

        {cameraError && <p className="fifteen-stage-note">{cameraError}</p>}

        {room?.phase === 'playing' && (
          <FifteenArena
            room={room}
            me={me}
            opponent={opponent}
            playerId={playerId}
            countdown={countdown}
            liveCall={liveCall}
            liveFingers={liveFingers}
            speechOk={speechOk}
            onPickCall={onPickCall}
          />
        )}

        {room?.phase === 'playing' && (
          <p className="fifteen-hand-hint">
            {handCount > 0 ? `偵測到 ${handCount} 隻手 · 指數 ${liveFingers}` : '請將手部放入鏡頭'}
          </p>
        )}
      </div>

      <FifteenLobby
        room={room}
        playerId={playerId}
        playerName={playerName}
        roomCodeInput={roomCodeInput}
        connected={connected}
        error={error}
        speechOk={speechOk}
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
