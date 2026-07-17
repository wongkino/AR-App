import { frameDistance, resample } from './landmarks'
import type { HandFrame } from '../types'

const TARGET_LEN = 24

/**
 * Dynamic Time Warping distance between two gesture sequences.
 * Lower = more similar. Typical match threshold ~0.25–0.45 after normalize.
 */
export function dtwDistance(a: HandFrame[], b: HandFrame[]): number {
  if (a.length === 0 || b.length === 0) return Infinity

  const seqA = resample(a, TARGET_LEN)
  const seqB = resample(b, TARGET_LEN)
  const n = seqA.length
  const m = seqB.length

  const prev = new Float64Array(m + 1)
  const curr = new Float64Array(m + 1)
  prev.fill(Infinity)
  prev[0] = 0

  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity
    for (let j = 1; j <= m; j++) {
      const cost = frameDistance(seqA[i - 1], seqB[j - 1])
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    prev.set(curr)
  }

  return prev[m] / TARGET_LEN
}

/** Convert DTW distance to a 0–1 similarity score. */
export function similarityFromDistance(distance: number): number {
  return 1 / (1 + distance)
}

export const MATCH_THRESHOLD = 0.62
