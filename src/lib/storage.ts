import type { SavedGesture } from '../types'

const KEY = 'gesture-lab:gestures'

export function loadGestures(): SavedGesture[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedGesture[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGestures(gestures: SavedGesture[]): void {
  localStorage.setItem(KEY, JSON.stringify(gestures))
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
