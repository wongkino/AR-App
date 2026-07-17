import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import FightApp from './FightApp.tsx'
import RpsApp from './RpsApp.tsx'

const path = window.location.pathname

function RootApp() {
  if (path === '/fight' || path.startsWith('/fight/')) return <FightApp />
  if (path === '/rps' || path.startsWith('/rps/')) return <RpsApp />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
