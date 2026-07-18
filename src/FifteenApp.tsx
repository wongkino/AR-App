import { useCallback, useEffect, useRef, useState } from 'react'
import { FifteenArena } from './components/fifteen/FifteenArena'
import { FifteenLobby } from './components/fifteen/FifteenLobby'
import { useHandLandmarker } from './hooks/useHandLandmarker'
import { countFingers } from './lib/fingerCount'
import { FifteenSocket } from './lib/fifteenSocket'
import { FifteenSpeechListener, speechRecognitionSupported } from './lib/fifteenSpeech'
import { FifteenVoiceMesh } from './lib/fifteenVoice'
import { playDraw, playLose, playWin, unlockSfx } from './lib/sfx'
import type { FifteenCall, HandMode, PublicFifteenRoom, RtcSignalPayload } from './game/fifteenTypes'
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
  const [micOn, setMicOn] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [speechArmed, setSpeechArmed] = useState(false)
  const [liveFingers, setLiveFingers] = useState(0)
  const [missMessage, setMissMessage] = useState<string | null>(null)
  const [speechHeard, setSpeechHeard] = useState<string | null>(null)
  const [speechHint, setSpeechHint] = useState<string | null>(null)
  const [speechOk] = useState(() => speechRecognitionSupported())
  const [now, setNow] = useState(() => Date.now())

  const socketRef = useRef(new FifteenSocket())
  const speechRef = useRef(new FifteenSpeechListener())
  const voiceRef = useRef(new FifteenVoiceMesh())
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

  const syncVoice = useCallback(async (nextRoom: PublicFifteenRoom | null, id: string | null) => {
    if (!nextRoom || !id || !micOn) return
    voiceRef.current.bind(id, (to, payload) => socketRef.current.rtcSignal(to, payload))
    await voiceRef.current.syncPeers(nextRoom.players.map((p) => p.id))
  }, [micOn])

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
        void syncVoice(nextRoom, id)
      },
      onRoomUpdate: (nextRoom) => {
        setRoom(nextRoom)
        setError(null)
        void syncVoice(nextRoom, playerIdRef.current)
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
      onRtcSignal: (from, payload) => {
        void voiceRef.current.handleSignal(from, payload as RtcSignalPayload)
      },
      onError: (message) => setError(message),
      onClose: () => setConnected(false),
    })

    return () => {
      speechRef.current.stop()
      voiceRef.current.dispose()
      socket.disconnect()
      if (missTimer.current) window.clearTimeout(missTimer.current)
    }
  }, [flashMiss, syncVoice])

  useEffect(() => {
    void syncVoice(room, playerId)
  }, [micOn, room, playerId, syncVoice])

  // Keep speech warm once armed — do not restart on freeze/now ticks
  useEffect(() => {
    if (!speechArmed || !speechOk) {
      speechRef.current.stop()
      return
    }

    speechRef.current.start(
      (call) => {
        if (roomRef.current?.phase === 'playing') sendCall(call)
      },
      (status) => {
        if (status.lastHeard) setSpeechHeard(status.lastHeard)
        setSpeechHint(status.error)
      },
    )

    return () => speechRef.current.stop()
  }, [speechArmed, speechOk, sendCall])

  const onFrame = useCallback((normalized: HandFrame | null, raw?: HandFrame | null) => {
    const fingers = countFingers(raw ?? normalized, handModeRef.current)
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
    // Start speech first, then open WebRTC mic; re-arm speech after mic settles
    if (speechOk) setSpeechArmed(true)
    window.setTimeout(() => {
      void (async () => {
        const micOk = await voiceRef.current.ensureMic()
        setMicOn(micOk)
        if (!micOk) {
          setError((prev) => prev ?? '未能開啟通話麥克風；仍可用按鈕／語音叫數')
        }
        if (speechOk) {
          setSpeechArmed(false)
          window.setTimeout(() => setSpeechArmed(true), 200)
        }
      })()
    }, 450)
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

  const onToggleMute = () => {
    const next = !micMuted
    setMicMuted(next)
    voiceRef.current.setMuted(next)
  }

  return (
    <div className="fifteen-app">
      <div className="fifteen-stage">
        <div className="fifteen-viewport">
          {!cameraOn && (
            <div className="fifteen-camera-gate">
              <h2>{ready ? '進入遊戲前請先開鏡頭' : '載入模型中…'}</h2>
              <p>
                開好相機、麥克風{speechOk ? '與叫數語音' : ''} 再入房。房間內可用即時語音聽到對方叫數。
              </p>
              <button type="button" className="primary" disabled={!ready} onClick={() => void openMedia()}>
                開啟相機與麥克風
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
            speechHeard={speechHeard}
            speechHint={speechHint}
            onPickCall={sendCall}
          />
        )}

        {cameraOn && (
          <p className="fifteen-hand-hint">
            {handCount > 0
              ? `偵測到 ${handCount} 隻手 · 指數 ${liveFingers}${room ? `／${room.fingersMax}` : ''}`
              : '請將手部放入鏡頭'}
            {micOn ? (micMuted ? ' · 咪高峰已靜音' : ' · 語音通話開啟中') : ' · 無麥克風'}
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
        micOn={micOn}
        micMuted={micMuted}
        onPlayerNameChange={setPlayerName}
        onRoomCodeInputChange={setRoomCodeInput}
        onCreateRoom={onCreateRoom}
        onJoinRoom={onJoinRoom}
        onReady={onReady}
        onToggleMute={onToggleMute}
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
