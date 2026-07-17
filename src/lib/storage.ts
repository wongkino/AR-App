import type { SavedGesture } from '../types'

const GESTURES_KEY = 'gesture-lab:gestures'
const ADMIN_SESSION_KEY = 'gesture-lab:admin-password'

export function loadGestures(): SavedGesture[] {
  try {
    const raw = localStorage.getItem(GESTURES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedGesture[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeGesture)
  } catch {
    return []
  }
}

function normalizeGesture(g: SavedGesture): SavedGesture {
  const samples = Array.isArray(g.samples)
    ? g.samples.filter((s) => Array.isArray(s) && s.length >= 4)
    : undefined
  return {
    ...g,
    frames: Array.isArray(g.frames) ? g.frames : [],
    samples: samples && samples.length > 0 ? samples : undefined,
  }
}

export function saveGesturesLocal(gestures: SavedGesture[]): void {
  localStorage.setItem(GESTURES_KEY, JSON.stringify(gestures))
}

/** Keep local trial gestures when reloading shared ones from the database. */
export function mergeRemoteGestures(
  remote: SavedGesture[],
  current: SavedGesture[],
): SavedGesture[] {
  const localOnly = current.filter((g) => g.localOnly)
  const shared = remote.map((g) => ({ ...normalizeGesture(g), localOnly: undefined }))
  return [...localOnly, ...shared]
}

/** Gestures that may be written to Postgres (exclude local trials). */
export function sharedGesturesForDb(gestures: SavedGesture[]): SavedGesture[] {
  return gestures
    .filter((g) => !g.localOnly)
    .map(({ localOnly: _ignored, ...rest }) => rest)
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function loadAdminPassword(): string | null {
  return sessionStorage.getItem(ADMIN_SESSION_KEY)
}

export function saveAdminPassword(password: string | null): void {
  if (!password) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    return
  }
  sessionStorage.setItem(ADMIN_SESSION_KEY, password)
}
