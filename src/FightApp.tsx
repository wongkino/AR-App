import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FightHud } from './components/fight/FightHud'
import { FightLobby } from './components/fight/FightLobby'
import { useHandLandmarker } from './hooks/useHandLandmarker'
import { fetchGestures } from './lib/api'
import { FightGestureMatcher } from './lib/fightMatcher'
import { FightSocket } from './lib/gameSocket'
import { loadGestures, mergeRemoteGestures } from './lib/storage'
import type { MoveLoadout, MoveType, PublicRoomState } from './game/types'
import { MOVE_LABELS } from './game/types'
import type { HandFrame, SavedGesture } from './types'
import './FightApp.css'

const DEFAULT_LOADOUT: MoveLoadout = {
  punch: null,
  kick: null,
  special: null,
  block: null,
}

function suggestLoadout(gestures: SavedGesture[]): MoveLoadout {
  const byKeyword = (keywords: string[]) =>
    gestures.find((g) => keywords.some((k) => g.name.includes(k)))?.id ?? null

  return {
    punch: byKeyword(['拳', 'punch', '打']) ?? gestures[0]?.id ?? null,
    kick: byKeyword(['踢', 'kick', '腳']) ?? gestures[1]?.id ?? null,
    special: byKeyword(['必殺', '大招', 'special']) ?? gestures[2]?.id ?? null,
    block: byKeyword(['擋', '防', 'block']) ?? gestures[3]?.id ?? null,
  }
}

export default function FightApp() {
  const [gestures, setGestures] = useState<SavedGesture[]>(() => loadGestures())
  const [room, setRoom] = useState<PublicRoomState | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('玩家')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [loadout, setLoadout] = useState<MoveLoadout>(DEFAULT_LOADOUT)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [lastMove, setLastMove] = useState<{
    move: MoveType
    attackerId: string
    damage: number
  } | null>(null)
  const [flashMove, setFlashMove] = useState<string | null>(null)

  const socketRef = useRef(new FightSocket())
  const matcherRef = useRef(new FightGestureMatcher())
  const roomRef = useRef(room)
  const playerIdRef = useRef(playerId)
  const loadoutRef = useRef(loadout)
  const attackingRef = useRef(false)

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
    const map = new Map<string, HandFrame[]>()
    for (const g of gestures) map.set(g.id, g.frames)
    return map
  }, [gestures])

  useEffect(() => {
    void (async () => {
      try {
        const remote = await fetchGestures()
        setGestures((prev) => {
          const merged = mergeRemoteGestures(remote, prev)
          setLoadout((current) => {
            const hasAny = Object.values(current).some(Boolean)
            return hasAny ? current : suggestLoadout(merged)
          })
          return merged
        })
      } catch {
        setGestures((prev) => {
          setLoadout((current) =>
            Object.values(current).some(Boolean) ? current : suggestLoadout(prev),
          )
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
      },
      onAttack: (payload) => {
        setLastMove({
          move: payload.move,
          attackerId: payload.attackerId,
          damage: payload.damage,
        })
        const label = MOVE_LABELS[payload.move]
        setFlashMove(label)
        window.setTimeout(() => setFlashMove(null), 900)
      },
      onError: (message) => setError(message),
      onClose: () => setConnected(false),
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const onFrame = useCallback(
    (frame: HandFrame | null) => {
      if (!frame) return
      const currentRoom = roomRef.current
      if (!currentRoom || currentRoom.phase !== 'fighting') return

      const matcher = matcherRef.current
      matcher.push(frame)
      if (attackingRef.current) return

      const match = matcher.tryMatch(loadoutRef.current, gestureFrames)
      if (!match) return

      attackingRef.current = true
      setFlashMove(MOVE_LABELS[match.move])
      socketRef.current.attack(match.move, match.gestureId, match.score)
      window.setTimeout(() => {
        attackingRef.current = false
        setFlashMove(null)
      }, 500)
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
    if (room?.phase === 'fighting') {
      matcherRef.current.clear()
      void ensureCamera()
    }
  }, [room?.phase, ensureCamera])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  const me = room?.players.find((p) => p.id === playerId) ?? null
  const opponent = room?.players.find((p) => p.id !== playerId) ?? null

  const onCreateRoom = () => {
    setError(null)
    socketRef.current.join(undefined, playerName.trim() || '玩家')
  }

  const onJoinRoom = () => {
    const code = roomCodeInput.trim()
    if (!code) {
      setError('請輸入房間代碼')
      return
    }
    setError(null)
    socketRef.current.join(code, playerName.trim() || '玩家')
  }

  const onReady = () => {
    const moves: MoveType[] = ['punch', 'kick', 'special', 'block']
    if (moves.some((m) => !loadout[m])) {
      setError('請為四種招式各選一個手勢')
      return
    }
    setError(null)
    socketRef.current.ready(loadout)
  }

  const onLoadoutChange = (move: MoveType, gestureId: string) => {
    setLoadout((prev) => ({ ...prev, [move]: gestureId || null }))
  }

  return (
    <div className="fight-app">
      <div className="fight-stage">
        <div className="fight-viewport">
          {!cameraOn && (
            <div className="fight-camera-gate">
              <h2>{ready ? '對戰需要相機' : '載入模型中…'}</h2>
              <p>開打後會自動開啟相機，做出拳／踢／必殺／擋的手勢攻擊對手。</p>
              {room?.phase === 'fighting' && (
                <button type="button" className="primary" disabled={!ready} onClick={() => void ensureCamera()}>
                  開啟相機
                </button>
              )}
            </div>
          )}
          <video ref={videoRef} className="fight-cam" playsInline muted autoPlay disablePictureInPicture />
          <canvas ref={canvasRef} className="fight-overlay" />
          {room?.phase === 'fighting' && <div className="fight-listen-badge">BATTLE</div>}
          {flashMove && <div className="fight-move-flash">{flashMove}</div>}
        </div>
        {cameraError && <p className="fight-stage-note">{cameraError}</p>}
        {room?.phase === 'fighting' && (
          <FightHud
            me={me}
            opponent={opponent}
            phase={room.phase}
            winnerId={room.winnerId}
            playerId={playerId}
            lastMove={lastMove}
          />
        )}
        {room?.phase === 'fighting' && (
          <p className="fight-hand-hint">
            {handCount > 0 ? `偵測到 ${handCount} 隻手 — 做出已配置的手勢出招` : '請將雙手放入鏡頭'}
          </p>
        )}
      </div>

      <FightLobby
        room={room}
        playerId={playerId}
        playerName={playerName}
        roomCodeInput={roomCodeInput}
        loadout={loadout}
        gestures={gestures}
        connected={connected}
        error={error}
        onPlayerNameChange={setPlayerName}
        onRoomCodeInputChange={setRoomCodeInput}
        onLoadoutChange={onLoadoutChange}
        onCreateRoom={onCreateRoom}
        onJoinRoom={onJoinRoom}
        onReady={onReady}
        onRematch={() => socketRef.current.rematch()}
      />
    </div>
  )
}
