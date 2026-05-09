import { NavLink } from 'react-router-dom'

const sections = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: '⚡', label: 'Dashboard' },
      { to: '/portfolio', icon: '📊', label: 'Portfolio' },
      { to: '/cash', icon: '💵', label: 'Cash & Transactions' },
    ],
  },
  {
    label: 'Trading',
    items: [
      { to: '/trades', icon: '📝', label: 'Trade Journal' },
      { to: '/calendar', icon: '📅', label: 'Calendar' },
      { to: '/symbols', icon: '🏷️', label: 'Symbols' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { to: '/fundamentals', icon: '🏦', label: 'Fundamentals' },
      { to: '/technical', icon: '📈', label: 'Technical Analysis' },
      { to: '/smart-money', icon: '🧠', label: 'Smart Money' },
      { to: '/analytics', icon: '🔬', label: 'Performance' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/calculators', icon: '🛡️', label: 'Calculators' },
      { to: '/settings', icon: '⚙️', label: 'Settings' },
    ],
  },
]

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandMark" style={{ color: '#3b82f6' }}>R</div>
        <div className="brandText">
          <div className="brandTitle">
            <span style={{ color: '#3b82f6' }}>Ri</span>
            <span style={{ color: '#93c5fd' }}>chBlue</span>
          </div>
          <div className="brandSub">Pro Analytics</div>
        </div>
      </div>

      {sections.map((sec) => (
        <div key={sec.label}>
          <div className="navSection">{sec.label}</div>
          <nav className="nav">
            {sec.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/'}
                className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}
              >
                <span className="navIcon">{it.icon}</span>
                {it.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}

      <div className="sidebarFooter">
        <div className="apiStatus">
          <div className="apiDot" />
          <span>API: 127.0.0.1:8001</span>
        </div>
      </div>
    </aside>
  )
}
