import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  type Category,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import { HAND_CONNECTIONS, normalizeFrame, packDualHand } from '../lib/landmarks'
import type { HandFrame, Landmark } from '../types'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const HAND_COLORS = {
  Left: { stroke: 'rgba(46, 196, 182, 0.95)', fill: '#2ec4b6' },
  Right: { stroke: 'rgba(244, 162, 97, 0.95)', fill: '#f4a261' },
  Unknown: { stroke: 'rgba(200, 200, 200, 0.9)', fill: '#ccc' },
} as const

type UseHandLandmarkerResult = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  ready: boolean
  error: string | null
  handCount: number
  latestFrame: HandFrame | null
  startCamera: () => Promise<void>
  stopCamera: () => void
  resumePreview: () => Promise<void>
}

function toLandmarks(raw: NormalizedLandmark[]): Landmark[] {
  return raw.map((p) => ({ x: p.x, y: p.y, z: p.z }))
}

function handednessLabel(categories: Category[] | undefined): 'Left' | 'Right' | 'Unknown' {
  const name = categories?.[0]?.categoryName
  if (name === 'Left' || name === 'Right') return name
  return 'Unknown'
}

export function useHandLandmarker(
  onFrame?: (frame: HandFrame | null) => void,
): UseHandLandmarkerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const onFrameRef = useRef(onFrame)
  const lastTsRef = useRef(0)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [handCount, setHandCount] = useState(0)
  const [latestFrame, setLatestFrame] = useState<HandFrame | null>(null)

  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.5,
        })
        if (cancelled) {
          landmarker.close()
          return
        }
        landmarkerRef.current = landmarker
        setReady(true)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '無法載入手勢模型')
        }
      }
    }

    void init()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      landmarkerRef.current?.close()
      landmarkerRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const drawHands = useCallback(
    (
      landmarksList: NormalizedLandmark[][],
      handednessList: Category[][],
      width: number,
      height: number,
    ) => {
      const canvas = canvasRef.current
      if (!canvas) return

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, width, height)

      landmarksList.forEach((landmarks, i) => {
        const label = handednessLabel(handednessList[i])
        const colors = HAND_COLORS[label]
        const pts = landmarks.map((p) => ({
          x: p.x * width,
          y: p.y * height,
        }))

        ctx.strokeStyle = colors.stroke
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.beginPath()
          ctx.moveTo(pts[a].x, pts[a].y)
          ctx.lineTo(pts[b].x, pts[b].y)
          ctx.stroke()
        }

        ctx.fillStyle = colors.fill
        for (const p of pts) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
          ctx.fill()
        }

        // Label near wrist
        ctx.font = '600 14px Outfit, sans-serif'
        ctx.fillStyle = colors.fill
        const tag = label === 'Left' ? 'L' : label === 'Right' ? 'R' : '?'
        ctx.fillText(tag, pts[0].x + 8, pts[0].y - 8)
      })
    },
    [],
  )

  const loop = useCallback(() => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current
    if (!video || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop)
      return
    }

    let ts = performance.now()
    if (ts <= lastTsRef.current) ts = lastTsRef.current + 1
    lastTsRef.current = ts

    const result = landmarker.detectForVideo(video, ts)
    const count = result.landmarks.length
    setHandCount(count)

    let frame: HandFrame | null = null
    if (count > 0) {
      let left: HandFrame | null = null
      let right: HandFrame | null = null

      result.landmarks.forEach((landmarks, i) => {
        const label = handednessLabel(result.handedness[i])
        const normalized = normalizeFrame(toLandmarks(landmarks))
        if (label === 'Left') left = normalized
        else if (label === 'Right') right = normalized
        else if (!left) left = normalized
        else if (!right) right = normalized
      })

      frame = packDualHand(left, right)
      drawHands(
        result.landmarks,
        result.handedness,
        video.videoWidth,
        video.videoHeight,
      )
    } else {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    setLatestFrame(frame)
    onFrameRef.current?.(frame)

    rafRef.current = requestAnimationFrame(loop)
  }, [drawHands])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(loop)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '無法開啟鏡頭，請允許相機權限',
      )
    }
  }, [loop])

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setHandCount(0)
    setLatestFrame(null)
  }, [])

  /** Re-play video + restart detect loop (iOS often pauses after TTS/beep). */
  const resumePreview = useCallback(async () => {
    const video = videoRef.current
    if (!video || !streamRef.current) return
    try {
      if (video.paused) {
        await video.play()
      }
    } catch {
      // ignore autoplay race
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  return {
    videoRef,
    canvasRef,
    ready,
    error,
    handCount,
    latestFrame,
    startCamera,
    stopCamera,
    resumePreview,
  }
}
