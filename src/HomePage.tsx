import { useState } from 'react'
import { AdminLoginModal } from './components/AdminLoginModal'
import './HomePage.css'

const GAMES = [
  {
    href: '/1520',
    title: '十五二十',
    desc: '語音叫 5／10／15／20，雙手伸手指；總和等於自己叫的數就贏。',
    tag: 'Multiplayer',
    emoji: '✋',
  },
  {
    href: '/rps',
    title: '包剪揼',
    desc: '2 人包剪揼。三盤兩勝，倒數後同時出招。',
    tag: 'Multiplayer',
    emoji: '✌️',
  },
] as const

export default function HomePage() {
  const [showLogin, setShowLogin] = useState(false)

  return (
    <div className="home">
      <header className="home-header">
        <p className="home-kicker">Gesture Lab</p>
        <h1>選擇遊戲</h1>
        <p className="home-lede">用手勢玩多人遊戲。包剪揼需先在設定完成手勢配對；十五二十用相機數指即可。</p>
      </header>

      <div className="home-grid">
        {GAMES.map((game) => (
          <a key={game.href} className="home-card" href={game.href}>
            <span className="home-card-tag">{game.tag}</span>
            <span className="home-card-emoji" aria-hidden>
              {game.emoji}
            </span>
            <h2>{game.title}</h2>
            <p>{game.desc}</p>
            <span className="home-card-cta">開始遊戲 →</span>
          </a>
        ))}
      </div>

      <footer className="home-footer">
        <button type="button" className="home-settings" onClick={() => setShowLogin(true)}>
          <span className="home-settings-icon" aria-hidden>
            ⚙️
          </span>
          <span>
            <strong>設定</strong>
            <small>管理手勢庫與遊戲配對</small>
          </span>
        </button>
      </footer>

      <AdminLoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  )
}
