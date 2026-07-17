import type { SavedGesture } from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

let adminPassword: string | null = null

export function setAdminPassword(password: string | null): void {
  adminPassword = password
}

export function getAdminPassword(): string | null {
  return adminPassword
}

async function request<T>(path: string, init?: RequestInit & { admin?: boolean }): Promise<T> {
  const { admin, ...rest } = init ?? {}
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> | undefined),
  }
  if (admin) {
    if (!adminPassword) throw new Error('請先輸入管理密碼')
    headers['X-Admin-Password'] = adminPassword
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `請求失敗（${res.status}）`)
  }
  return data
}

export async function verifyAdminPassword(password: string): Promise<void> {
  await request('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export async function createWorkspace(): Promise<{ syncKey: string }> {
  return request('/api/workspaces', { method: 'POST', admin: true })
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
    admin: true,
    body: JSON.stringify({ gestures }),
  })
}
