import { dtwDistance, MATCH_THRESHOLD, similarityFromDistance } from '../lib/dtw'
import type { HandFrame, MatchResult, SavedGesture } from '../types'

const WINDOW_MS = 1800
const COOLDOWN_MS = 2200

export class GestureMatcher {
  private buffer: { t: number; frame: HandFrame }[] = []
  private lastMatchAt = 0
  private lastMatchedId: string | null = null

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
    this.lastMatchedId = null
  }

  tryMatch(gestures: SavedGesture[]): MatchResult | null {
    if (gestures.length === 0 || this.buffer.length < 8) return null

    const now = performance.now()
    if (now - this.lastMatchAt < COOLDOWN_MS) return null

    const live = this.buffer.map((b) => b.frame)
    let best: MatchResult | null = null

    for (const g of gestures) {
      if (g.frames.length < 4) continue
      const distance = dtwDistance(live, g.frames)
      const score = similarityFromDistance(distance)
      if (score < MATCH_THRESHOLD) continue
      if (!best || score > best.score) {
        best = { gestureId: g.id, gestureName: g.name, score }
      }
    }

    if (!best) return null

    // Avoid immediate re-fire of same gesture unless score is clearly strong
    if (best.gestureId === this.lastMatchedId && best.score < 0.72) {
      return null
    }

    this.lastMatchAt = now
    this.lastMatchedId = best.gestureId
    this.buffer = []
    return best
  }
}
