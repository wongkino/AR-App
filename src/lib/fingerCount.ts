import type { HandFrame, Landmark } from '../types'
import type { HandMode } from '../game/fifteenTypes'

const POINTS = 21

/**
 * Finger count for 十五二十 (prefer raw MediaPipe landmarks).
 * - Fist (收晒) → 0
 * - Open palm → 5
 * - Partial → 1–4
 */
function isEmptyHand(hand: Landmark[]): boolean {
  return hand.every((p) => p.x === 0 && p.y === 0 && p.z === 0)
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Angle at point b (degrees) formed by a–b–c. */
function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const bax = a.x - b.x
  const bay = a.y - b.y
  const baz = a.z - b.z
  const bcx = c.x - b.x
  const bcy = c.y - b.y
  const bcz = c.z - b.z
  const mag = Math.hypot(bax, bay, baz) * Math.hypot(bcx, bcy, bcz) || 1
  const cos = Math.min(1, Math.max(-1, (bax * bcx + bay * bcy + baz * bcz) / mag))
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * Non-thumb: all conditions required so a fist (tips curled in) stays 0.
 * tip / pip / dip / mcp landmark indices.
 */
function isFingerExtended(
  hand: Landmark[],
  tip: number,
  dip: number,
  pip: number,
  mcp: number,
): boolean {
  const wrist = hand[0]
  const tipPt = hand[tip]
  const pipPt = hand[pip]
  const mcpPt = hand[mcp]

  // Fist: tip folds back toward palm / wrist — not farther out than PIP
  if (dist(tipPt, wrist) <= dist(pipPt, wrist) * 1.08) return false

  // Must be fairly straight at PIP and DIP
  const bendPip = angleDeg(mcpPt, pipPt, tipPt)
  const bendDip = angleDeg(pipPt, hand[dip], tipPt)
  if (bendPip < 155 || bendDip < 145) return false

  // Tip clearly past PIP relative to MCP
  if (dist(tipPt, mcpPt) <= dist(pipPt, mcpPt) * 1.12) return false

  return true
}

/** Thumb tucked into fist should NOT count. */
function isThumbExtended(hand: Landmark[]): boolean {
  const wrist = hand[0]
  const tip = hand[4]
  const ip = hand[3]
  const mcp = hand[2]

  // Fist / tucked thumb: tip not clearly farther from wrist than IP
  if (dist(tip, wrist) <= dist(ip, wrist) * 1.12) return false

  const bend = angleDeg(mcp, ip, tip)
  if (bend < 150) return false

  if (dist(tip, mcp) <= dist(ip, mcp) * 1.1) return false

  return true
}

function countOneHand(hand: Landmark[]): number {
  if (hand.length < POINTS || isEmptyHand(hand)) return 0
  let n = 0
  if (isThumbExtended(hand)) n += 1

  // tip, dip, pip, mcp
  const fingers: [number, number, number, number][] = [
    [8, 7, 6, 5],
    [12, 11, 10, 9],
    [16, 15, 14, 13],
    [20, 19, 18, 17],
  ]
  for (const [tip, dip, pip, mcp] of fingers) {
    if (isFingerExtended(hand, tip, dip, pip, mcp)) n += 1
  }
  return Math.max(0, Math.min(5, n))
}

/** Prefer raw (unnormalized) dual/single hand frames. */
export function countFingers(frame: HandFrame | null, mode: HandMode = 'two'): number {
  if (!frame || frame.length === 0) return 0

  if (frame.length >= 42) {
    const left = frame.slice(0, 21)
    const right = frame.slice(21, 42)
    const l = countOneHand(left)
    const r = countOneHand(right)
    if (mode === 'one') {
      return Math.max(0, Math.min(5, Math.max(l, r)))
    }
    return Math.max(0, Math.min(10, l + r))
  }

  return Math.max(0, Math.min(mode === 'one' ? 5 : 10, countOneHand(frame.slice(0, 21))))
}
