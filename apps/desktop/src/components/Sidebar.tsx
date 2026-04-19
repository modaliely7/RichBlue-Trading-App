import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useAccount } from './AccountContext'
import { api } from '../lib/api'

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
      { to: '/risk', icon: '🛡️', label: 'Risk Manager' },
      { to: '/coach', icon: '🤖', label: 'AI Coach' },
      { to: '/settings', icon: '⚙️', label: 'Settings' },
    ],
  },
]

export function Sidebar() {
  const { accounts, currentAccount, setCurrentAccount, refreshAccounts } = useAccount()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'Real' | 'Testing'>('Real')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleAddAccount = async () => {
    if (!newName.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const created = await api.createAccount({ name: newName.trim(), account_type: newType })
      await refreshAccounts()
      setCurrentAccount(created)
      setNewName('')
      setNewType('Real')
      setShowAddForm(false)
    } catch (e: any) {
      setSaveError(e?.message ?? 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandMark">T</div>
        <div className="brandText">
          <div className="brandTitle">TradeDesk</div>
          <div className="brandSub">Pro Analytics</div>
        </div>
      </div>

      <div className="accountSwitcher">
        <div className="label" style={{ padding: '0 12px 6px', fontSize: 10 }}>ACTIVE ACCOUNT</div>
        <div className="accountSelector">
          <select
            value={currentAccount?.id || ''}
            onChange={(e) => {
              const acc = accounts.find(a => a.id === Number(e.target.value))
              if (acc) setCurrentAccount(acc)
            }}
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.account_type === 'Real' ? '🔵' : '🧪'} {acc.name}
              </option>
            ))}
          </select>
          <div className="accountType">
            {currentAccount?.account_type}
          </div>
        </div>

        {/* Add Account toggle */}
        <button
          type="button"
          onClick={() => { setShowAddForm(v => !v); setSaveError(null) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            margin: '6px 12px 0', padding: '4px 8px',
            background: 'transparent', border: '1px solid rgba(56,189,248,0.25)',
            borderRadius: 6, color: '#38bdf8', fontSize: 11, cursor: 'pointer',
            width: 'calc(100% - 24px)',
          }}
        >
          {showAddForm ? '✕ Cancel' : '+ Add Account'}
        </button>

        {showAddForm && (
          <div style={{ padding: '8px 12px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              placeholder="Account name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
              style={{ fontSize: 12, padding: '5px 8px' }}
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as 'Real' | 'Testing')}
              style={{ fontSize: 12, padding: '5px 8px' }}
            >
              <option value="Real">🔵 Real</option>
              <option value="Testing">🧪 Testing</option>
            </select>
            <button
              type="button"
              className="btn"
              disabled={saving || !newName.trim()}
              onClick={handleAddAccount}
              style={{ fontSize: 12, padding: '5px 0' }}
            >
              {saving ? 'Saving…' : 'Save Account'}
            </button>
            {saveError && <div className="error" style={{ fontSize: 11 }}>{saveError}</div>}
          </div>
        )}
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
