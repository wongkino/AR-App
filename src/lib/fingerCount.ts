import type { HandFrame, Landmark } from '../types'

const POINTS = 21

/**
 * Finger count for 十五二十:
 * - Open palm (包) → 5
 * - Fist (拳頭) → 0
 * - Both hands → max 10 per player
 *
 * Extended if tip is farther from MCP than the pip/IP joint (thumb: tip vs IP from MCP).
 */
function isEmptyHand(hand: Landmark[]): boolean {
  return hand.every((p) => p.x === 0 && p.y === 0 && p.z === 0)
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Tip farther from MCP than joint → finger counts as open. */
function isExtended(hand: Landmark[], tip: number, joint: number, mcp: number): boolean {
  return dist(hand[tip], hand[mcp]) > dist(hand[joint], hand[mcp]) * 1.08
}

function countOneHand(hand: Landmark[]): number {
  if (hand.length < POINTS || isEmptyHand(hand)) return 0
  let n = 0

  // Thumb: tip 4 vs IP 3, relative to MCP 2
  if (isExtended(hand, 4, 3, 2)) n += 1

  // Index / middle / ring / pinky: tip vs pip, relative to MCP
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

/** Dual-hand (42) or single (21); per player clamped to 0–10. */
export function countFingers(frame: HandFrame | null): number {
  if (!frame || frame.length === 0) return 0

  if (frame.length >= 42) {
    const left = frame.slice(0, 21)
    const right = frame.slice(21, 42)
    return Math.max(0, Math.min(10, countOneHand(left) + countOneHand(right)))
  }

  return Math.max(0, Math.min(10, countOneHand(frame.slice(0, 21))))
}
