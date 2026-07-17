import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import FightApp from './FightApp.tsx'

const isFightRoute =
  window.location.pathname === '/fight' || window.location.pathname.startsWith('/fight/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isFightRoute ? <FightApp /> : <App />}</StrictMode>,
)
