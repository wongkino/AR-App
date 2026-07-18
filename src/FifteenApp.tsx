import { useCallback, useEffect, useRef, useState } from 'react'
import { FifteenArena } from './components/fifteen/FifteenArena'
import { FifteenLobby } from './components/fifteen/FifteenLobby'
import { useHandLandmarker } from './hooks/useHandLandmarker'
import { countFingers } from './lib/fingerCount'
import { FifteenSocket } from './lib/fifteenSocket'
import { FifteenSpeechListener, speechRecognitionSupported } from './lib/fifteenSpeech'
import { playDraw, playLose, playWin, unlockSfx } from './lib/sfx'
import type { FifteenCall, HandMode, PublicFifteenRoom } from './game/fifteenTypes'
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
  const [speechArmed, setSpeechArmed] = useState(false)
  const [liveFingers, setLiveFingers] = useState(0)
  const [missMessage, setMissMessage] = useState<string | null>(null)
  const [speechOk] = useState(() => speechRecognitionSupported())
  const [now, setNow] = useState(() => Date.now())

  const socketRef = useRef(new FifteenSocket())
  const speechRef = useRef(new FifteenSpeechListener())
  const roomRef = useRef(room)
  const playerIdRef = useRef(playerId)
  const handModeRef = useRef<HandMode>('one')
  const lastSentFingers = useRef<number | null>(null)
  const missTimer = useRef<number | null>(null)
  const callBusyRef = useRef(false)

  useEffect(() => {
    roomRef.current = room
    if (room?.handMode) handModeRef.current = room.handMode
  }, [room])

  useEffect(() => {
    playerIdRef.current = playerId
  }, [playerId])

  const flashMiss = useCallback((message: string) => {
    setMissMessage(message)
    if (missTimer.current) window.clearTimeout(missTimer.current)
    missTimer.current = window.setTimeout(() => setMissMessage(null), 1200)
  }, [])

  const sendCall = useCallback((call: FifteenCall) => {
    const currentRoom = roomRef.current
    if (!currentRoom || currentRoom.phase !== 'playing') return
    if (currentRoom.freezeUntil > Date.now()) return
    if (callBusyRef.current) return
    callBusyRef.current = true
    window.setTimeout(() => {
      callBusyRef.current = false
    }, 280)
    void unlockSfx()
    socketRef.current.call(call)
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
      },
      onHit: (payload) => {
        setRoom(payload.room)
        setMissMessage(null)
        const meId = playerIdRef.current
        if (!meId) return
        if (payload.result.winnerId === meId) {
          playWin()
        } else if (payload.room.winnerId && payload.room.winnerId !== meId) {
          playLose()
        } else {
          playDraw()
        }
      },
      onMiss: (payload) => {
        flashMiss(payload.message)
      },
      onError: (message) => setError(message),
      onClose: () => setConnected(false),
    })

    return () => {
      speechRef.current.stop()
      socket.disconnect()
      if (missTimer.current) window.clearTimeout(missTimer.current)
    }
  }, [flashMiss])

  // Keep speech warm once armed; only score calls during playing
  useEffect(() => {
    if (!speechArmed || !speechOk) {
      speechRef.current.stop()
      return
    }

    const frozen = Boolean(room?.freezeUntil && room.freezeUntil > Date.now())
    if (room?.phase === 'playing' && frozen) {
      speechRef.current.stop()
      return
    }

    speechRef.current.start((call) => {
      if (roomRef.current?.phase === 'playing') sendCall(call)
    })

    return () => speechRef.current.stop()
  }, [speechArmed, speechOk, room?.phase, room?.freezeUntil, room?.lastHit?.at, now, sendCall])

  const onFrame = useCallback((frame: HandFrame | null) => {
    const fingers = countFingers(frame, handModeRef.current)
    setLiveFingers(fingers)

    const currentRoom = roomRef.current
    if (!currentRoom || currentRoom.phase !== 'playing') return

    if (lastSentFingers.current === fingers) return
    lastSentFingers.current = fingers
    socketRef.current.fingers(fingers)
  }, [])

  const { videoRef, canvasRef, ready, error: cameraError, handCount, startCamera, stopCamera } =
    useHandLandmarker(onFrame)

  const openMedia = useCallback(async () => {
    await unlockSfx()
    await startCamera()
    setCameraOn(true)
    if (speechOk) setSpeechArmed(true)
  }, [speechOk, startCamera])

  useEffect(() => () => stopCamera(), [stopCamera])

  useEffect(() => {
    if (room?.phase === 'playing') lastSentFingers.current = null
  }, [room?.phase])

  useEffect(() => {
    if (room?.phase !== 'playing' || !room.freezeUntil) return
    if (room.freezeUntil <= Date.now()) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [room?.phase, room?.freezeUntil])

  const roomForArena =
    room && room.phase === 'playing'
      ? { ...room, frozen: room.freezeUntil > now }
      : room

  const me = room?.players.find((p) => p.id === playerId) ?? null

  const onCreateRoom = () => {
    const code = roomCodeInput.trim()
    if (!/^[A-Za-z0-9]{4}$/.test(code)) {
      setError('請輸入四位英數房間代碼')
      return
    }
    if (!cameraOn) {
      setError('請先開啟相機')
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
    if (!cameraOn) {
      setError('請先開啟相機')
      return
    }
    setError(null)
    void unlockSfx()
    socketRef.current.join(code, playerName.trim() || '玩家')
  }

  const onReady = () => {
    if (!cameraOn) {
      setError('請先開啟相機')
      return
    }
    setError(null)
    void unlockSfx()
    if (speechOk && !speechArmed) setSpeechArmed(true)
    socketRef.current.ready()
  }

  return (
    <div className="fifteen-app">
      <div className="fifteen-stage">
        <div className="fifteen-viewport">
          {!cameraOn && (
            <div className="fifteen-camera-gate">
              <h2>{ready ? '進入遊戲前請先開鏡頭' : '載入模型中…'}</h2>
              <p>
                開好相機{speechOk ? '與語音' : ''} 再建立／加入房間，開打就唔使趕住授權。
                多人可選單手或雙手，持續變手指鬥快叫中總和。
              </p>
              <button type="button" className="primary" disabled={!ready} onClick={() => void openMedia()}>
                {speechOk ? '開啟相機與語音' : '開啟相機'}
              </button>
            </div>
          )}
          <video ref={videoRef} className="fifteen-cam" playsInline muted autoPlay disablePictureInPicture />
          <canvas ref={canvasRef} className="fifteen-overlay" />
          {cameraOn && <div className="fifteen-live-badge">{room?.phase === 'playing' ? 'LIVE' : 'READY'}</div>}
        </div>

        {cameraError && <p className="fifteen-stage-note">{cameraError}</p>}

        {roomForArena?.phase === 'playing' && (
          <FifteenArena
            room={roomForArena}
            me={me}
            playerId={playerId}
            liveFingers={liveFingers}
            missMessage={missMessage}
            speechOk={speechOk}
            onPickCall={sendCall}
          />
        )}

        {cameraOn && (
          <p className="fifteen-hand-hint">
            {handCount > 0
              ? `偵測到 ${handCount} 隻手 · 指數 ${liveFingers}${room ? `／${room.fingersMax}` : ''}`
              : '請將手部放入鏡頭'}
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
        mediaReady={cameraOn}
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
        onHandModeChange={(mode) => socketRef.current.setHandMode(mode)}
      />
    </div>
  )
}
