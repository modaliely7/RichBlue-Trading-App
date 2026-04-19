import { NavLink } from 'react-router-dom'

const items: Array<{ to: string; label: string }> = [
  { to: '/', label: 'Dashboard' },
  { to: '/trades', label: 'Trades' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/symbols', label: 'Symbols' },
  { to: '/fundamentals', label: 'Stock Fundamentals' },
  { to: '/technical', label: 'Technical Analysis' },
  { to: '/smart-money', label: 'Quant & Smart Money' },
  { to: '/analytics', label: 'Performance Analytics' },
  { to: '/coach', label: 'AI Coach' },
  { to: '/risk', label: 'Risk Management' },
  { to: '/settings', label: 'Settings' },
]

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandMark" />
        <div className="brandText">
          <div className="brandTitle">Trading Analytics</div>
          <div className="brandSub">Journal & Portfolio</div>
        </div>
      </div>

      <nav className="nav">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}
          >
            {it.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebarFooter">
        <div className="hint">Local-first • FastAPI + SQLite</div>
      </div>
    </aside>
  )
}

