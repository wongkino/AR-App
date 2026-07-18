import type { HandFrame, Landmark } from '../types'

const POINTS = 21

function isEmptyHand(hand: Landmark[]): boolean {
  return hand.every((p) => p.x === 0 && p.y === 0 && p.z === 0)
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Count extended fingers on one hand using tip vs pip (thumb tip vs IP). */
function countOneHand(hand: Landmark[]): number {
  if (hand.length < POINTS || isEmptyHand(hand)) return 0
  const wrist = hand[0]
  let n = 0

  // Thumb: tip 4 vs IP 3
  if (dist(hand[4], wrist) > dist(hand[3], wrist) * 1.05) n += 1

  // Index / middle / ring / pinky: tip vs pip
  const pairs: [number, number][] = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ]
  for (const [tip, pip] of pairs) {
    if (dist(hand[tip], wrist) > dist(hand[pip], wrist) * 1.05) n += 1
  }
  return n
}

/** Dual-hand frame (42) or single (21); total clamped to 0–10. */
export function countFingers(frame: HandFrame | null): number {
  if (!frame || frame.length === 0) return 0

  if (frame.length >= 42) {
    const left = frame.slice(0, 21)
    const right = frame.slice(21, 42)
    return Math.max(0, Math.min(10, countOneHand(left) + countOneHand(right)))
  }

  return Math.max(0, Math.min(10, countOneHand(frame.slice(0, 21))))
}
