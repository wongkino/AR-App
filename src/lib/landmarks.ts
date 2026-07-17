import type { HandFrame, Landmark } from '../types'

const WRIST = 0
const MIDDLE_MCP = 9
const POINTS_PER_HAND = 21

export const emptyHand = (): HandFrame =>
  Array.from({ length: POINTS_PER_HAND }, () => ({ x: 0, y: 0, z: 0 }))

/** Translate to wrist origin and scale by palm size so gestures are size/position invariant. */
export function normalizeFrame(landmarks: Landmark[]): HandFrame {
  const wrist = landmarks[WRIST]
  const mid = landmarks[MIDDLE_MCP]
  const scale = Math.hypot(mid.x - wrist.x, mid.y - wrist.y, mid.z - wrist.z) || 1

  return landmarks.map((p) => ({
    x: (p.x - wrist.x) / scale,
    y: (p.y - wrist.y) / scale,
    z: (p.z - wrist.z) / scale,
  }))
}

/** Pack left + right into a fixed 42-point dual-hand frame. */
export function packDualHand(
  left: HandFrame | null,
  right: HandFrame | null,
): HandFrame {
  return [...(left ?? emptyHand()), ...(right ?? emptyHand())]
}

function meanDistance(a: Landmark[], b: Landmark[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return Infinity
  let sum = 0
  for (let i = 0; i < n; i++) {
    const dx = a[i].x - b[i].x
    const dy = a[i].y - b[i].y
    const dz = a[i].z - b[i].z
    sum += Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
  return sum / n
}

function isEmptyHand(hand: Landmark[]): boolean {
  return hand.every((p) => p.x === 0 && p.y === 0 && p.z === 0)
}

/**
 * Distance between frames. Supports dual (42) and legacy single (21).
 * Lower = more similar.
 */
export function frameDistance(a: HandFrame, b: HandFrame): number {
  const dualA = a.length >= 42
  const dualB = b.length >= 42

  if (dualA && dualB) {
    const aL = a.slice(0, 21)
    const aR = a.slice(21, 42)
    const bL = b.slice(0, 21)
    const bR = b.slice(21, 42)
    const parts: number[] = []
    if (!isEmptyHand(aL) || !isEmptyHand(bL)) parts.push(meanDistance(aL, bL))
    if (!isEmptyHand(aR) || !isEmptyHand(bR)) parts.push(meanDistance(aR, bR))
    if (parts.length === 0) return Infinity
    return parts.reduce((s, v) => s + v, 0) / parts.length
  }

  // Legacy single-hand vs dual: match against the closer live hand
  if (!dualA && dualB) {
    const bL = b.slice(0, 21)
    const bR = b.slice(21, 42)
    const candidates = [bL, bR].filter((h) => !isEmptyHand(h))
    if (candidates.length === 0) return Infinity
    return Math.min(...candidates.map((h) => meanDistance(a, h)))
  }
  if (dualA && !dualB) {
    const aL = a.slice(0, 21)
    const aR = a.slice(21, 42)
    const candidates = [aL, aR].filter((h) => !isEmptyHand(h))
    if (candidates.length === 0) return Infinity
    return Math.min(...candidates.map((h) => meanDistance(h, b)))
  }

  return meanDistance(a, b)
}

/** Resample a sequence to a fixed length by linear interpolation of frames. */
export function resample(frames: HandFrame[], targetLen: number): HandFrame[] {
  if (frames.length === 0) return []
  if (frames.length === 1) return Array.from({ length: targetLen }, () => frames[0])
  if (frames.length === targetLen) return frames

  const out: HandFrame[] = []
  for (let i = 0; i < targetLen; i++) {
    const t = (i / (targetLen - 1)) * (frames.length - 1)
    const i0 = Math.floor(t)
    const i1 = Math.min(i0 + 1, frames.length - 1)
    const w = t - i0
    const a = frames[i0]
    const b = frames[i1]
    const len = Math.max(a.length, b.length)
    const frame: Landmark[] = []
    for (let j = 0; j < len; j++) {
      const pa = a[j] ?? a[a.length - 1]
      const pb = b[j] ?? b[b.length - 1]
      frame.push({
        x: pa.x + (pb.x - pa.x) * w,
        y: pa.y + (pb.y - pa.y) * w,
        z: pa.z + (pb.z - pa.z) * w,
      })
    }
    out.push(frame)
  }
  return out
}

/** MediaPipe hand connections for drawing. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]
