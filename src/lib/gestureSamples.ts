import type { HandFrame, SavedGesture } from '../types'

/** All DTW templates for a gesture (primary frames + extra samples). */
export function gestureTemplates(g: SavedGesture): HandFrame[][] {
  const extras = Array.isArray(g.samples)
    ? g.samples.filter((s): s is HandFrame[] => Array.isArray(s) && s.length >= 4)
    : []
  const primary = g.frames.length >= 4 ? [g.frames] : []
  return [...primary, ...extras]
}

export function sampleCount(g: SavedGesture): number {
  return gestureTemplates(g).length
}

export const MAX_SAMPLES = 8
