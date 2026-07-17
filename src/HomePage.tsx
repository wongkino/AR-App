import { useState } from 'react'
import { AdminLoginModal } from './components/AdminLoginModal'
import './HomePage.css'

const GAMES = [
  {
    href: '/fight',
    title: '手勢格鬥',
    desc: '2 人即時對戰。錄製拳、踢、必殺、擋的手勢，對住鏡頭出招扣 HP。',
    tag: 'Multiplayer',
    emoji: '🥊',
  },
  {
    href: '/rps',
    title: '包剪揼',
    desc: '2 人包剪揼。配置包、剪、揼手勢，三盤兩勝，倒數後同時出招。',
    tag: 'Multiplayer',
    emoji: '✊',
  },
] as const

export default function HomePage() {
  const [showLogin, setShowLogin] = useState(false)

  return (
    <div className="home">
      <header className="home-header">
        <p className="home-kicker">Gesture Lab</p>
        <h1>選擇遊戲</h1>
        <p className="home-lede">用手勢玩多人遊戲。管理員可先設定手勢庫，再開局對戰。</p>
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
            <small>管理員登入後管理手勢庫</small>
          </span>
        </button>
      </footer>

      <AdminLoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  )
}
