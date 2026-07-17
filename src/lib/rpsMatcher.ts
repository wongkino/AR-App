import { dtwDistance, MATCH_THRESHOLD, similarityFromDistance } from './dtw'
import type { HandFrame } from '../types'
import type { RpsLoadout, RpsMove } from '../game/rpsTypes'

const WINDOW_MS = 1400
const COOLDOWN_MS = 700

export type RpsMatch = {
  move: RpsMove
  gestureId: string
  score: number
}

export class RpsGestureMatcher {
  private buffer: { t: number; frame: HandFrame }[] = []
  private lastMatchAt = 0

  push(frame: HandFrame): void {
    const now = performance.now()
    this.buffer.push({ t: now, frame })
    const cutoff = now - WINDOW_MS
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) {
      this.buffer.shift()
    }
  }

  clear(): void {
    this.buffer = []
    this.lastMatchAt = 0
  }

  tryMatch(loadout: RpsLoadout, gestureFrames: Map<string, HandFrame[]>): RpsMatch | null {
    if (this.buffer.length < 6) return null

    const now = performance.now()
    if (now - this.lastMatchAt < COOLDOWN_MS) return null

    const live = this.buffer.map((b) => b.frame)
    let best: RpsMatch | null = null

    const moves: RpsMove[] = ['rock', 'scissors', 'paper']
    for (const move of moves) {
      const gestureId = loadout[move]
      if (!gestureId) continue
      const frames = gestureFrames.get(gestureId)
      if (!frames || frames.length < 4) continue

      const distance = dtwDistance(live, frames)
      const score = similarityFromDistance(distance)
      if (score < MATCH_THRESHOLD) continue
      if (!best || score > best.score) {
        best = { move, gestureId, score }
      }
    }

    if (!best) return null

    this.lastMatchAt = now
    this.buffer = []
    return best
  }
}
