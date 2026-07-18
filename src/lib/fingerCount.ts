import type { HandFrame, Landmark } from '../types'
import type { HandMode } from '../game/fifteenTypes'

const POINTS = 21

/**
 * Finger count for 十五二十:
 * - Open palm → 5 / Fist → 0
 * - one: single hand, max 5
 * - two: both hands, max 10
 */
function isEmptyHand(hand: Landmark[]): boolean {
  return hand.every((p) => p.x === 0 && p.y === 0 && p.z === 0)
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function isExtended(hand: Landmark[], tip: number, joint: number, mcp: number): boolean {
  return dist(hand[tip], hand[mcp]) > dist(hand[joint], hand[mcp]) * 1.08
}

function countOneHand(hand: Landmark[]): number {
  if (hand.length < POINTS || isEmptyHand(hand)) return 0
  let n = 0
  if (isExtended(hand, 4, 3, 2)) n += 1
  const fingers: [number, number, number][] = [
    [8, 6, 5],
    [12, 10, 9],
    [16, 14, 13],
    [20, 18, 17],
  ]
  for (const [tip, pip, mcp] of fingers) {
    if (isExtended(hand, tip, pip, mcp)) n += 1
  }
  return n
}

export function countFingers(frame: HandFrame | null, mode: HandMode = 'two'): number {
  if (!frame || frame.length === 0) return 0

  if (frame.length >= 42) {
    const left = frame.slice(0, 21)
    const right = frame.slice(21, 42)
    const l = countOneHand(left)
    const r = countOneHand(right)
    if (mode === 'one') {
      // Prefer the hand that is visible / has more fingers
      return Math.max(0, Math.min(5, Math.max(l, r)))
    }
    return Math.max(0, Math.min(10, l + r))
  }

  const n = countOneHand(frame.slice(0, 21))
  return Math.max(0, Math.min(mode === 'one' ? 5 : 10, n))
}
