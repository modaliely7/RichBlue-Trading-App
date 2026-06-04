import { useState } from 'react'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { User, Target, Database, Palette, Maximize2, Plus, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useAccount } from '../components/AccountContext'
import { type Account, type Strategy } from '../lib/api'
import { PageHeader } from '../components/ui'
import { Button } from '../components/ui'

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

type TabId = 'accounts' | 'strategies' | 'data' | 'appearance' | 'display'

const TABS: { id: TabId; label: string; desc: string; Icon: typeof User }[] = [
  { id: 'accounts', label: 'Accounts', desc: 'Manage your profiles', Icon: User },
  { id: 'strategies', label: 'Strategies', desc: 'Define your edge', Icon: Target },
  { id: 'data', label: 'Data', desc: 'Backup & Restore', Icon: Database },
  { id: 'appearance', label: 'Theme', desc: 'Colors & Icons', Icon: Palette },
  { id: 'display', label: 'Display', desc: 'Font & Zoom', Icon: Maximize2 },
]

export function SettingsPage() {
  const { currentAccount, accounts, refreshAccounts } = useAccount()
  const qc = useQueryClient()
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabId>('accounts')

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
    return localStorage.getItem('theme') || 'light'
  })

  const applyTheme = (t: string) => {
    setTheme(t)
    localStorage.setItem('theme', t)
    if (t === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
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

  return (
    <div className="page" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Settings"
        subtitle="Configure your trading environment and preferences."
      />

      {(message || error) && (
        <div className="bannerStack">
          {message && (
            <div className="banner success">
              <span className="bannerIcon"><Check size={18} /></span>
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="banner danger">
              <span className="bannerIcon">!</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      <div className="settingsShell">
        <nav className="settingsNav" aria-label="Settings sections">
          {TABS.map(({ id, label, desc, Icon }) => (
            <button
              key={id}
              type="button"
              className={`settingsNavItem ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
            >
              <span className="settingsNavIcon"><Icon size={22} /></span>
              <span className="settingsNavText">
                <span className="settingsNavTitle">{label}</span>
                <span className="settingsNavDesc">{desc}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="card settingsContent">
          {activeTab === 'accounts' && (
            <div className="tabSection">
              <div className="sectionHeader">
                <h2>Account Management</h2>
                <p className="muted">Manage your portfolios. Max limit: 3 accounts.</p>
              </div>

              <div className="accountList">
                {accounts.map(acc => (
                  <div key={acc.id} className="card accountItem">
                    {editingAccountId === acc.id ? (
                      <div className="formRow" style={{ flex: 1 }}>
                        <input className="input" value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                        <Button onClick={() => updateAccountMutation.mutate({ id: acc.id, name: editName })}>Save Changes</Button>
                        <Button variant="ghost" onClick={() => setEditingAccountId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <div className="accountInfo">
                          <div className="accountAvatar">{acc.name.charAt(0).toUpperCase()}</div>
                          <div>
                            <div className="accountName">{acc.name}</div>
                            <div className="muted accountMeta">
                              Account #{acc.id} - {acc.id === mainAccountId ? 'Primary' : 'Secondary'}
                            </div>
                          </div>
                        </div>
                        <div className="accountActions">
                          <Button variant="ghost" onClick={() => { setEditingAccountId(acc.id); setEditName(acc.name); }}>
                            Rename
                          </Button>
                          {acc.id !== mainAccountId && (
                            <Button
                              variant="danger"
                              onClick={() => { if (confirm('Delete this account and all its trades?')) deleteAccountMutation.mutate(acc.id) }}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {isAddingAccount ? (
                  <div className="addAccountBox">
                    <div className="label mb8">New Account Name</div>
                    <div className="formRow">
                      <input
                        className="input"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="e.g., Retirement Fund 2024"
                        autoFocus
                      />
                      <Button onClick={() => createAccountMutation.mutate(newName)} disabled={!newName.trim()}>
                        Create Account
                      </Button>
                      <Button variant="ghost" onClick={() => setIsAddingAccount(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : accounts.length < 3 ? (
                  <button className="dottedAddBtn" type="button" onClick={() => setIsAddingAccount(true)}>
                    <Plus size={18} /> Add Another Account
                  </button>
                ) : (
                  <div className="muted limitNote">Account limit reached (Max 3).</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'strategies' && (
            <div className="tabSection">
              <div className="sectionHeader">
                <h2>Strategy Setup</h2>
                <p className="muted">Define the rules and setups that formulate your edge.</p>
              </div>

              <div className="tableWrap">
                <table className="table strategyTable">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Label Color</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strategies.map(s => (
                      <tr key={s.id}>
                        {editingStId === s.id ? (
                          <>
                            <td>
                              <input className="input" value={editStName} onChange={e => setEditStName(e.target.value)} />
                            </td>
                            <td>
                              <input
                                type="color"
                                value={editStColor}
                                onChange={e => setEditStColor(e.target.value)}
                                className="colorInput"
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Button size="sm" onClick={() => updateStrategyMutation.mutate({ id: s.id, name: editStName, color: editStColor })}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingStId(null)}>Cancel</Button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</td>
                            <td>
                              <span className="colorTag">
                                <span className="colorTagSwatch" style={{ background: s.color || 'var(--accent)' }} />
                                <span className="colorTagHex">{s.color || '#default'}</span>
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingStId(s.id); setEditStName(s.name); setEditStColor(s.color || '#3b82f6'); }}>
                                Edit
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => { if (confirm('Delete this strategy? Trades using it will be untagged.')) deleteStrategyMutation.mutate(s.id) }}>
                                Remove
                              </Button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {strategies.length === 0 && (
                      <tr className="emptyRow">
                        <td colSpan={3}>No strategies defined yet. Create them when adding trades.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="tabSection">
              <div className="sectionHeader">
                <h2>Data Management</h2>
                <p className="muted">Export, restore, or securely wipe your financial data.</p>
              </div>

              <div className="dataGrid">
                <div className="dataCard">
                  <div className="dataCardIcon" aria-hidden>📦</div>
                  <div className="dataCardTitle">Backup &amp; Export</div>
                  <p className="dataCardDesc">
                    Securely download your entire journal, including trades, transactions, and strategies as a JSON file.
                  </p>
                  <Button
                    fullWidth
                    onClick={() => backupMutation.mutate()}
                    loading={backupMutation.isPending}
                  >
                    {backupMutation.isPending ? 'Generating...' : 'Download Backup'}
                  </Button>
                </div>

                <div className="dataCard">
                  <div className="dataCardIcon" aria-hidden>☁️</div>
                  <div className="dataCardTitle">Restore Data</div>
                  <p className="dataCardDesc">
                    Upload a previously exported backup file to restore your entire trading history instantly.
                  </p>
                  <label className="uploadLabel">
                    <input
                      type="file"
                      accept=".json"
                      onChange={e => { if (e.target.files?.[0]) restoreMutation.mutate(e.target.files[0]) }}
                    />
                    {restoreMutation.isPending ? 'Restoring...' : 'Upload & Restore'}
                  </label>
                </div>

                <div className="dataCard danger full">
                  <div>
                    <div className="dataCardTitle">Danger Zone: Wipe Data</div>
                    <p className="dataCardDesc">Permanently delete all trades and transactions. This action cannot be undone.</p>
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => { if (confirm('CRITICAL: This will delete ALL trades in this account. Continue?')) clearMutation.mutate() }}
                    loading={clearMutation.isPending}
                  >
                    {clearMutation.isPending ? 'Clearing...' : 'Wipe All Data'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="tabSection">
              <div className="sectionHeader">
                <h2>Interface Theme</h2>
                <p className="muted">Choose the visual style that best fits your workflow.</p>
              </div>

              <div className="themeGrid">
                {[
                  { id: 'light', label: 'Light', bg: '#f8fafc', accent: '#8719e0' },
                  { id: 'dark', label: 'Dark', bg: '#141520', accent: '#a368fc' }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`themeCard ${theme === t.id ? 'active' : ''}`}
                    onClick={() => applyTheme(t.id)}
                  >
                    <div className="themePreview" style={{ background: t.bg }}>
                      <div
                        className="themeDot"
                        style={{ background: t.accent }}
                      />
                    </div>
                    <div className="themeCardFoot">
                      <span>{t.label}</span>
                      {theme === t.id && <Check size={18} />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div className="tabSection">
              <div className="sectionHeader">
                <h2>Display &amp; Scaling</h2>
                <p className="muted">Adjust the interface size to fit your screen perfectly.</p>
              </div>

              <div className="zoomPanel">
                <div className="zoomHeader">
                  <div>
                    <h3>UI Scaling (Zoom)</h3>
                    <p className="muted">Current Scale: {zoom}%</p>
                  </div>
                  <div className="zoomIcon" aria-hidden>🔍</div>
                </div>

                <div className="zoomControls">
                  <Button variant="ghost" onClick={() => applyZoom(String(Math.max(70, Number(zoom) - 5)))}>A-</Button>
                  <input
                    type="range"
                    min="70"
                    max="150"
                    step="5"
                    value={zoom}
                    onChange={e => applyZoom(e.target.value)}
                  />
                  <Button variant="ghost" onClick={() => applyZoom(String(Math.min(150, Number(zoom) + 5)))}>A+</Button>
                </div>

                <div className="zoomReset">
                  <Button fullWidth onClick={() => applyZoom('100')}>Reset to Default (100%)</Button>
                </div>

                <div className="tipBar">
                  <p>
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
