import { dtwDistance, MATCH_THRESHOLD, similarityFromDistance } from './dtw'
import type { HandFrame } from '../types'
import type { MoveLoadout, MoveType } from '../game/types'

const WINDOW_MS = 1600
const COOLDOWN_MS = 900

export type FightMatch = {
  move: MoveType
  gestureId: string
  score: number
}

export class FightGestureMatcher {
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

  tryMatch(
    loadout: MoveLoadout,
    gestureTemplatesMap: Map<string, HandFrame[][]>,
  ): FightMatch | null {
    if (this.buffer.length < 8) return null

    const now = performance.now()
    if (now - this.lastMatchAt < COOLDOWN_MS) return null

    const live = this.buffer.map((b) => b.frame)
    let best: FightMatch | null = null

    const moves: MoveType[] = ['punch', 'kick', 'special', 'block']
    for (const move of moves) {
      const gestureId = loadout[move]
      if (!gestureId) continue
      const templates = gestureTemplatesMap.get(gestureId)
      if (!templates || templates.length === 0) continue

      let score = 0
      for (const template of templates) {
        if (template.length < 4) continue
        const s = similarityFromDistance(dtwDistance(live, template))
        if (s > score) score = s
      }
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
