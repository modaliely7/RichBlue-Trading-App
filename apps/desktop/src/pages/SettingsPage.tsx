import { useState } from 'react'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAccount } from '../components/AccountContext'
import { type Account, type Strategy } from '../lib/api'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function SettingsPage() {
  const { currentAccount, accounts, refreshAccounts } = useAccount()
  const qc = useQueryClient()
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'accounts' | 'strategies' | 'data' | 'appearance' | 'display'>('accounts')

  const accountId = currentAccount?.id ?? 1

  // Strategies Management
  const { data: strategies = [], refetch: refetchStrategies } = useQuery<Strategy[]>({
    queryKey: ['strategies', accountId],
    queryFn: () => api.listStrategies(accountId)
  })
  const [editingStId, setEditingStId] = useState<number | null>(null)
  const [editStName, setEditStName] = useState('')
  const [editStColor, setEditStColor] = useState('')

  // Account Management State
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [newName, setNewName] = useState('')

  const mainAccountId = accounts.length > 0 ? Math.min(...accounts.map(a => a.id)) : -1

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'default'
  })

  const applyTheme = (t: string) => {
    setTheme(t)
    localStorage.setItem('theme', t)
    if (t === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', t)
    }
  }

  const [zoom, setZoom] = useState(() => {
    return localStorage.getItem('ui-zoom') || '100'
  })

  const applyZoom = (z: string) => {
    setZoom(z)
    localStorage.setItem('ui-zoom', z)
    document.documentElement.style.setProperty('--ui-zoom', `${z}%`)
  }

  const backupMutation = useMutation({
    mutationFn: () => api.backupDataset(accountId),
    onSuccess: (blob) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      downloadBlob(blob, `richblue-backup-${stamp}.json`)
      setError('')
      setMessage('Backup downloaded successfully.')
    },
    onError: (e) => { setError(e instanceof Error ? e.message : 'Backup failed') },
  })

  const clearMutation = useMutation({
    mutationFn: () => api.clearDataset(accountId),
    onSuccess: async () => {
      await qc.invalidateQueries()
      setError('')
      setMessage('Dataset cleared successfully.')
    },
    onError: (e) => { setError(e instanceof Error ? e.message : 'Clear failed') },
  })

  const restoreMutation = useMutation({
    mutationFn: (file: File) => api.restoreDataset(file, accountId),
    onSuccess: async (res) => {
      await qc.invalidateQueries()
      setError('')
      setMessage(`Restore successful. ${res.trades} trades imported.`)
    },
    onError: (e) => { setError(e instanceof Error ? e.message : 'Restore failed') },
  })

  const updateStrategyMutation = useMutation({
    mutationFn: (payload: { id: number; name: string; color: string }) => api.updateStrategy(payload.id, { name: payload.name, color: payload.color }),
    onSuccess: () => {
      refetchStrategies()
      setEditingStId(null)
      qc.invalidateQueries({ queryKey: ['overview'] })
    }
  })

  const deleteStrategyMutation = useMutation({
    mutationFn: api.deleteStrategy,
    onSuccess: () => {
      refetchStrategies()
      qc.invalidateQueries({ queryKey: ['overview'] })
    }
  })

  const createAccountMutation = useMutation({
    mutationFn: (name: string) => apiFetch<Account>('/accounts', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      refreshAccounts()
      setIsAddingAccount(false)
      setNewName('')
    }
  })

  const updateAccountMutation = useMutation({
    mutationFn: (payload: { id: number; name: string }) => apiFetch<Account>(`/accounts/${payload.id}`, { method: 'PATCH', body: JSON.stringify({ name: payload.name }) }),
    onSuccess: () => {
      refreshAccounts()
      setEditingAccountId(null)
    }
  })

  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => apiFetch<{ deleted: boolean }>(`/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => refreshAccounts()
  })

  const TABS = [
    { id: 'accounts', label: 'Accounts', icon: '👤', desc: 'Manage your profiles' },
    { id: 'strategies', label: 'Strategies', icon: '🎯', desc: 'Define your edge' },
    { id: 'data', label: 'Data', icon: '💾', desc: 'Backup & Restore' },
    { id: 'appearance', label: 'Theme', icon: '✨', desc: 'Colors & Icons' },
    { id: 'display', label: 'Display', icon: '🔍', desc: 'Font & Zoom' }
  ] as const

  return (
    <div className="page" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="pageHeader" style={{ padding: '30px 0', borderBottom: '1px solid var(--border)', marginBottom: 30 }}>
        <div>
          <div className="pageTitle" style={{ fontSize: 32, letterSpacing: '-0.5px' }}>Settings</div>
          <div className="pageSubtitle" style={{ fontSize: 16 }}>Configure your trading environment and preferences.</div>
        </div>
      </div>

      {(message || error) && (
        <div style={{ marginBottom: 20, animation: 'slideIn 0.3s ease' }}>
          {message && <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--accent2)', color: 'var(--text)', background: 'var(--accent2-glow)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>✅</span> {message}
          </div>}
          {error && <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--danger)', color: 'var(--text)', background: 'var(--danger-glow)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>❌</span> {error}
          </div>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 32, minHeight: 600 }}>
        {/* Modern Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TABS.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '16px 20px',
                borderRadius: 16,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                background: activeTab === tab.id ? 'var(--panel-light)' : 'transparent',
                border: `1px solid ${activeTab === tab.id ? 'var(--border)' : 'transparent'}`,
                boxShadow: activeTab === tab.id ? '0 4px 20px rgba(0,0,0,0.1)' : 'none',
                transform: activeTab === tab.id ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              <div style={{ 
                fontSize: 24, 
                width: 44, 
                height: 44, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: activeTab === tab.id ? 'var(--bg)' : 'var(--panel)',
                borderRadius: 12,
                boxShadow: activeTab === tab.id ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}>
                {tab.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: activeTab === tab.id ? 'var(--text-strong)' : 'var(--text)' }}>
                  {tab.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {tab.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Content Area */}
        <div className="card" style={{ padding: 40, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
          {activeTab === 'accounts' && (
            <div className="animateSlideIn">
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Account Management</h2>
                <p className="muted" style={{ marginTop: 8 }}>Manage your portfolios. Max limit: 3 accounts.</p>
              </div>
              
              <div style={{ display: 'grid', gap: 16 }}>
                {accounts.map(acc => (
                  <div key={acc.id} className="card" style={{ 
                    padding: 24, 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    transition: 'border-color 0.2s',
                  }}>
                    {editingAccountId === acc.id ? (
                      <div style={{ display: 'flex', gap: 12, flex: 1 }}>
                        <input className="input" value={editName} onChange={e => setEditName(e.target.value)} autoFocus style={{ flex: 1, fontSize: 16 }} />
                        <button className="btn" onClick={() => updateAccountMutation.mutate({ id: acc.id, name: editName })}>Save Changes</button>
                        <button className="btn btnGhost" onClick={() => setEditingAccountId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 48, height: 48, borderRadius: 24, background: 'var(--accent-glow)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>
                            {acc.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-strong)' }}>{acc.name}</div>
                            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Account #{acc.id} • {acc.id === mainAccountId ? 'Primary' : 'Secondary'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <button className="btn btnGhost" onClick={() => { setEditingAccountId(acc.id); setEditName(acc.name); }}>Rename</button>
                          {acc.id !== mainAccountId && (
                            <button className="btn btnDanger" onClick={() => { if (confirm('Delete this account and all its trades?')) deleteAccountMutation.mutate(acc.id) }}>Delete</button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {isAddingAccount ? (
                  <div className="card" style={{ padding: 24, background: 'var(--panel-light)', border: '2px dashed var(--accent)', borderRadius: 16 }}>
                    <div className="label" style={{ marginBottom: 8, fontSize: 14 }}>New Account Name</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Retirement Fund 2024" autoFocus style={{ flex: 1 }} />
                      <button className="btn" onClick={() => createAccountMutation.mutate(newName)} disabled={!newName.trim()}>Create Account</button>
                      <button className="btn btnGhost" onClick={() => setIsAddingAccount(false)}>Cancel</button>
                    </div>
                  </div>
                ) : accounts.length < 3 ? (
                  <button className="btn" style={{ 
                    padding: 24, 
                    border: '2px dashed var(--border)', 
                    background: 'transparent', 
                    borderRadius: 16,
                    color: 'var(--text)',
                    fontSize: 16,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.2s'
                  }} 
                  onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent)', e.currentTarget.style.color = 'var(--accent)')}
                  onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)', e.currentTarget.style.color = 'var(--text)')}
                  onClick={() => setIsAddingAccount(true)}>
                    <span>+</span> Add Another Account
                  </button>
                ) : (
                  <div className="muted" style={{ textAlign: 'center', padding: 24, background: 'var(--bg)', borderRadius: 16 }}>Account limit reached (Max 3).</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'strategies' && (
            <div className="animateSlideIn">
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Strategy Setup</h2>
                <p className="muted" style={{ marginTop: 8 }}>Define the rules and setups that formulate your edge.</p>
              </div>
              
              <div className="tableWrap" style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead style={{ background: 'var(--bg)' }}>
                    <tr>
                      <th style={{ padding: '16px 20px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</th>
                      <th style={{ padding: '16px 20px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Label Color</th>
                      <th style={{ textAlign: 'right', padding: '16px 20px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strategies.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                        {editingStId === s.id ? (
                          <>
                            <td style={{ padding: '16px 20px' }}>
                              <input className="input" value={editStName} onChange={e => setEditStName(e.target.value)} style={{ width: '100%' }} />
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <input type="color" value={editStColor} onChange={e => setEditStColor(e.target.value)} style={{ width: 44, height: 44, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8 }} />
                            </td>
                            <td style={{ textAlign: 'right', padding: '16px 20px' }}>
                              <button className="btn" style={{ marginRight: 8 }} onClick={() => updateStrategyMutation.mutate({ id: s.id, name: editStName, color: editStColor })}>Save</button>
                              <button className="btn btnGhost" onClick={() => setEditingStId(null)}>Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ fontWeight: 600, padding: '20px', fontSize: 15 }}>{s.name}</td>
                            <td style={{ padding: '20px' }}>
                              <div style={{ 
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '4px 12px 4px 4px', 
                                borderRadius: 20, 
                                background: 'var(--bg)',
                                border: '1px solid var(--border)'
                              }}>
                                <div style={{ width: 20, height: 20, borderRadius: 10, background: s.color || 'var(--accent)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }} />
                                <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{s.color || '#default'}</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', padding: '20px' }}>
                              <button className="btn btnGhost" onClick={() => { setEditingStId(s.id); setEditStName(s.name); setEditStColor(s.color || '#3b82f6'); }}>Edit</button>
                              <button className="btn btnDanger" onClick={() => { if (confirm('Delete this strategy? Trades using it will be untagged.')) deleteStrategyMutation.mutate(s.id) }} style={{ marginLeft: 8 }}>Remove</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {strategies.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                          No strategies defined yet. Create them when adding trades.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="animateSlideIn">
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Data Management</h2>
                <p className="muted" style={{ marginTop: 8 }}>Export, restore, or securely wipe your financial data.</p>
              </div>
              
              <div className="grid2" style={{ gap: 24 }}>
                <div className="card panel" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>📦</div>
                  <div className="panelTitle" style={{ fontSize: 18, marginBottom: 8 }}>Backup & Export</div>
                  <p className="muted" style={{ fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
                    Securely download your entire journal, including trades, transactions, and strategies as a JSON file.
                  </p>
                  <button className="btn" style={{ width: '100%', padding: 14 }} onClick={() => backupMutation.mutate()}>
                    {backupMutation.isPending ? 'Generating...' : 'Download Backup'}
                  </button>
                </div>

                <div className="card panel" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>☁️</div>
                  <div className="panelTitle" style={{ fontSize: 18, marginBottom: 8 }}>Restore Data</div>
                  <p className="muted" style={{ fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
                    Upload a previously exported backup file to restore your entire trading history instantly.
                  </p>
                  <label className="btn btnGhost" style={{ display: 'block', textAlign: 'center', padding: 14, cursor: 'pointer', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                    <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) restoreMutation.mutate(e.target.files[0]) }} />
                    {restoreMutation.isPending ? 'Restoring...' : 'Upload & Restore'}
                  </label>
                </div>

                <div className="card panel span2" style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                  <div>
                    <div className="panelTitle" style={{ color: 'var(--danger)', fontSize: 18, marginBottom: 4 }}>Danger Zone: Wipe Data</div>
                    <p style={{ color: 'var(--danger)', opacity: 0.8, fontSize: 14, margin: 0 }}>Permanently delete all trades and transactions. This action cannot be undone.</p>
                  </div>
                  <button className="btn btnDanger" style={{ padding: '12px 24px', fontWeight: 600 }} onClick={() => { if (confirm('CRITICAL: This will delete ALL trades in this account. Continue?')) clearMutation.mutate() }}>
                    {clearMutation.isPending ? 'Clearing...' : 'Wipe All Data'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="animateSlideIn">
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Interface Theme</h2>
                <p className="muted" style={{ marginTop: 8 }}>Choose the visual style that best fits your workflow.</p>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20 }}>
                {[
                  { id: 'default', label: 'Default Dark', bg: '#060b17', accent: '#3b82f6' },
                  { id: 'midnight', label: 'Midnight Blue', bg: '#030712', accent: '#818cf8' },
                  { id: 'ocean', label: 'Deep Ocean', bg: '#0c4a6e', accent: '#38bdf8' },
                  { id: 'emerald', label: 'Emerald City', bg: '#022c22', accent: '#34d399' },
                  { id: 'light', label: 'Clean Light', bg: '#f8fafc', accent: '#2563eb' },
                  { id: 'medred', label: 'Retrowave', bg: '#2b1a3d', accent: '#f43f5e' }
                ].map(t => (
                  <div
                    key={t.id}
                    onClick={() => applyTheme(t.id)}
                    className="themeCard"
                    style={{
                      background: 'var(--bg)',
                      padding: 16,
                      borderRadius: 16,
                      cursor: 'pointer',
                      border: `2px solid ${theme === t.id ? 'var(--accent)' : 'var(--border)'}`,
                      transition: 'all 0.2s',
                      transform: theme === t.id ? 'translateY(-2px)' : 'none',
                      boxShadow: theme === t.id ? '0 8px 24px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    <div style={{ 
                      width: '100%', 
                      height: 80, 
                      background: t.bg, 
                      borderRadius: 12, 
                      marginBottom: 16, 
                      border: '1px solid rgba(255,255,255,0.1)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '50%', background: `linear-gradient(to top, ${t.accent}20, transparent)` }} />
                      <div style={{ position: 'absolute', bottom: 12, left: 12, width: 24, height: 24, borderRadius: 12, background: t.accent, border: '2px solid rgba(255,255,255,0.2)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme === t.id ? 'var(--text-strong)' : 'var(--text)' }}>{t.label}</div>
                      {theme === t.id && <div style={{ color: 'var(--accent)' }}>✓</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div className="animateSlideIn">
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Display & Scaling</h2>
                <p className="muted" style={{ marginTop: 8 }}>Adjust the interface size to fit your screen perfectly.</p>
              </div>

              <div className="card panel" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>UI Scaling (Zoom)</div>
                    <p className="muted" style={{ fontSize: 14, margin: 0 }}>Current Scale: {zoom}%</p>
                  </div>
                  <div style={{ fontSize: 32 }}>🔍</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <button className="btn btnGhost" onClick={() => applyZoom(String(Math.max(70, Number(zoom) - 5)))}>A-</button>
                  <input 
                    type="range" 
                    min="70" 
                    max="150" 
                    step="5" 
                    value={zoom} 
                    onChange={e => applyZoom(e.target.value)} 
                    style={{ flex: 1, accentColor: 'var(--accent)' }}
                  />
                  <button className="btn btnGhost" onClick={() => applyZoom(String(Math.min(150, Number(zoom) + 5)))}>A+</button>
                </div>
                
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button className="btn" style={{ flex: 1 }} onClick={() => applyZoom('100')}>Reset to Default (100%)</button>
                </div>

                <div style={{ marginTop: 32, padding: 16, background: 'var(--panel-light)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted2)', lineHeight: 1.5 }}>
                    <b>Tip:</b> If the text is too big or too small, adjust this slider. Changes are applied instantly and saved to your profile.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`http://127.0.0.1:8001${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Network error' }))
    throw new Error(err.detail || 'API error')
  }
  return res.json()
}
