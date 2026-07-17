import type { SavedGesture } from '../types'

const GESTURES_KEY = 'gesture-lab:gestures'
const SYNC_KEY = 'gesture-lab:sync-key'

export function loadGestures(): SavedGesture[] {
  try {
    const raw = localStorage.getItem(GESTURES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedGesture[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGesturesLocal(gestures: SavedGesture[]): void {
  localStorage.setItem(GESTURES_KEY, JSON.stringify(gestures))
}

export function loadSyncKey(): string | null {
  return localStorage.getItem(SYNC_KEY)
}

export function saveSyncKey(syncKey: string | null): void {
  if (!syncKey) {
    localStorage.removeItem(SYNC_KEY)
    return
  }
  localStorage.setItem(SYNC_KEY, syncKey.trim().toUpperCase())
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
