import type { SavedGesture } from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `請求失敗（${res.status}）`)
  }
  return data
}

export async function createWorkspace(): Promise<{ syncKey: string }> {
  return request('/api/workspaces', { method: 'POST' })
}

export async function verifyWorkspace(syncKey: string): Promise<{ syncKey: string }> {
  return request(`/api/workspaces/${encodeURIComponent(syncKey)}`)
}

export async function fetchGestures(syncKey: string): Promise<SavedGesture[]> {
  const data = await request<{ gestures: SavedGesture[] }>(
    `/api/workspaces/${encodeURIComponent(syncKey)}/gestures`,
  )
  return data.gestures
}

export async function pushGestures(syncKey: string, gestures: SavedGesture[]): Promise<void> {
  await request(`/api/workspaces/${encodeURIComponent(syncKey)}/gestures`, {
    method: 'PUT',
    body: JSON.stringify({ gestures }),
  })
}
