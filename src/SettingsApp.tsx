import { useEffect, useState } from 'react'
import App from './App'
import { setAdminPassword, verifyAdminPassword } from './lib/api'
import { loadAdminPassword, saveAdminPassword } from './lib/storage'
import './SettingsApp.css'

export default function SettingsApp() {
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const saved = loadAdminPassword()
    if (!saved) {
      window.location.replace('/')
      return
    }

    void (async () => {
      try {
        await verifyAdminPassword(saved)
        setAdminPassword(saved)
        setReady(true)
      } catch {
        saveAdminPassword(null)
        setAdminPassword(null)
        window.location.replace('/')
      } finally {
        setChecking(false)
      }
    })()
  }, [])

  if (checking) {
    return (
      <div className="settings-gate">
        <p>正在驗證管理員身分…</p>
      </div>
    )
  }

  if (!ready) return null

  return <App />
}
