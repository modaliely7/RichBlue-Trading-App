import { NavLink } from 'react-router-dom'

const sections = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: '📊' },
      { to: '/portfolio', label: 'Portfolio', icon: '💼' },
      { to: '/cash', label: 'Cash & Ledger', icon: '🏦' },
    ],
  },
  {
    label: 'Trading',
    items: [
      { to: '/trades/add', label: 'Add Trade', icon: '➕' },
      { to: '/trades', label: 'Trade Journal', icon: '📓' },
      { to: '/calendar', label: 'Calendar', icon: '📅' },
      { to: '/symbols', label: 'Symbols', icon: '📈' },
      { to: '/strategies', label: 'Strategies', icon: '🎯' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { to: '/fundamentals', label: 'Fundamentals', icon: '🏢' },
      { to: '/technical', label: 'Technical Analysis', icon: '📉' },
      { to: '/smart-money', label: 'Smart Money', icon: '🐋' },
      { to: '/analytics', label: 'Performance', icon: '🚀' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/calculators', label: 'Calculators', icon: '🧮' },
      { to: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
]

export function Sidebar() {
  return (
    <aside className="sidebar" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      padding: '24px 16px',
      borderRight: '1px solid var(--border)',
      background: 'var(--bg2)',
      height: '100vh',
      position: 'sticky',
      top: 0
    }}>
      <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40, padding: '0 8px' }}>
        <div className="brandMark" style={{ 
          background: 'linear-gradient(135deg, var(--accent), #818cf8)', 
          color: 'white', 
          width: 36, 
          height: 36, 
          borderRadius: 10, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          fontWeight: 800,
          fontSize: 16,
          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
        }}>RB</div>
        <div className="brandText" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="brandTitle" style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px', color: 'var(--text-strong)' }}>RichBlue</div>
          <div className="brandSub" style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pro Analytics</div>
        </div>
      </div>

      {sections.map((sec) => (
        <div key={sec.label} style={{ marginBottom: 12 }}>
          <div className="navSection" style={{ 
            fontSize: 11, 
            fontWeight: 700, 
            textTransform: 'uppercase', 
            letterSpacing: '1px', 
            color: 'var(--muted)',
            marginBottom: 8,
            padding: '0 8px'
          }}>{sec.label}</div>
          <nav className="nav" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sec.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/'}
                className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--accent)' : 'var(--text)',
                  background: isActive ? 'var(--accent-glow)' : 'transparent',
                  transition: 'all 0.2s',
                  textDecoration: 'none'
                })}
              >
                <span style={{ fontSize: 16, opacity: 0.9 }}>{it.icon}</span>
                {it.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}

      <div className="sidebarFooter" style={{ 
        marginTop: 'auto', 
        paddingTop: 20, 
        borderTop: '1px solid var(--border)',
        padding: '20px 8px 0 8px'
      }}>
        <div className="apiStatus" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
          <div className="apiDot" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--good)', boxShadow: '0 0 8px var(--good)' }} />
          <span>v2.0.0 • Local</span>
        </div>
      </div>
    </aside>
  )
}
