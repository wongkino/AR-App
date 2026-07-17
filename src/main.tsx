import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import FightApp from './FightApp.tsx'
import HomePage from './HomePage.tsx'
import RpsApp from './RpsApp.tsx'

const path = window.location.pathname

function RootApp() {
  if (path === '/settings' || path.startsWith('/settings/')) return <App />
  if (path === '/fight' || path.startsWith('/fight/')) return <FightApp />
  if (path === '/rps' || path.startsWith('/rps/')) return <RpsApp />
  return <HomePage />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
