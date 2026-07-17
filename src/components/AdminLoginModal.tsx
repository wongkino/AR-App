import { useState } from 'react'
import { setAdminPassword, verifyAdminPassword } from '../lib/api'
import { saveAdminPassword } from '../lib/storage'
import './AdminLoginModal.css'

type Props = {
  open: boolean
  onClose: () => void
}

export function AdminLoginModal({ open, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const onSubmit = async () => {
    const value = password.trim()
    if (!value) {
      setError('請輸入管理密碼')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await verifyAdminPassword(value)
      setAdminPassword(value)
      saveAdminPassword(value)
      window.location.href = '/settings'
    } catch (err) {
      setError(err instanceof Error ? err.message : '密碼錯誤')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="admin-login-title">管理員登入</h2>
        <p className="admin-modal-hint">輸入密碼以進入手勢設定頁面。</p>
        <label className="admin-modal-field">
          <span>管理密碼</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="管理密碼"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSubmit()
            }}
          />
        </label>
        {error && <p className="admin-modal-error">{error}</p>}
        <div className="admin-modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={loading}>
            取消
          </button>
          <button type="button" className="primary" onClick={() => void onSubmit()} disabled={loading}>
            {loading ? '驗證中…' : '進入設定'}
          </button>
        </div>
      </div>
    </div>
  )
}
