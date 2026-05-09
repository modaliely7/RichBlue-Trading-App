import { useState } from 'react'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAccount } from '../components/AccountContext'

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

  // Strategies Management
  const { data: strategies = [], refetch: refetchStrategies } = useQuery({
    queryKey: ['strategies', currentAccount?.id],
    queryFn: () => api.listStrategies(currentAccount?.id ?? 1)
  })
  const [editingStId, setEditingStId] = useState<number | null>(null)
  const [editStName, setEditStName] = useState('')

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

  const backupMutation = useMutation({
    mutationFn: () => api.backupDataset(currentAccount?.id ?? 1),
    onSuccess: (blob) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      downloadBlob(blob, `trading-backup-${stamp}.json`)
      setError('')
      setMessage('Backup downloaded successfully.')
    },
    onError: (e) => {
      setMessage('')
      setError(e instanceof Error ? e.message : 'Backup failed')
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => api.clearDataset(currentAccount?.id ?? 1),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['assets', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['psychology', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['psychologySummary', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['lessons', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['insights', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['trades', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['performanceAnalytics', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['cashBalance', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions', currentAccount?.id] }),
      ])
      setError('')
      setMessage('Dataset cleared successfully.')
    },
    onError: (e) => {
      setMessage('')
      setError(e instanceof Error ? e.message : 'Clear dataset failed')
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (file: File) => api.restoreDataset(file, currentAccount?.id ?? 1),
    onSuccess: async (res) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['assets', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['psychology', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['psychologySummary', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['lessons', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['insights', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['trades', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['performanceAnalytics', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['cashBalance', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions', currentAccount?.id] }),
      ])
      setError('')
      setMessage(`Restore successful. ${res.trades} trades imported.`)
    },
    onError: (e) => {
      setMessage('')
      setError(e instanceof Error ? e.message : 'Restore failed')
    },
  })

  const isBusy = backupMutation.isPending || clearMutation.isPending || restoreMutation.isPending

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Settings</div>
          <div className="pageSubtitle">Manage accounts, backup, and maintenance actions.</div>
        </div>
      </div>

      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="panelTitle">Account management</div>
        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => {
                const isEditing = editingAccountId === acc.id
                return (
                  <tr key={acc.id}>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          style={{ padding: 4, width: '100%' }}
                        />
                      ) : (
                        acc.name
                      )}
                    </td>
                    <td>
                      <div className="detailsActions" style={{ marginTop: 0 }}>
                        {isEditing ? (
                          <>
                            <button
                              className="btn btnGhost"
                              onClick={async () => {
                                try {
                                  await api.updateAccount(acc.id, { name: editName })
                                  await refreshAccounts()
                                  setEditingAccountId(null)
                                  setMessage('Account updated.')
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : 'Update failed')
                                }
                              }}
                            >
                              Save
                            </button>
                            <button className="btn btnGhost" onClick={() => setEditingAccountId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btnGhost"
                              onClick={() => {
                                setEditingAccountId(acc.id)
                                setEditName(acc.name)
                              }}
                            >
                              Edit
                            </button>
                            {acc.id !== mainAccountId && (
                              <button
                                className="btn btnGhost"
                                style={{ color: '#ef4444' }}
                                onClick={async () => {
                                const ok = window.confirm(`Delete account "${acc.name}"? This deletes all its data!`)
                                if (ok) {
                                  try {
                                    await api.deleteAccount(acc.id)
                                    await refreshAccounts()
                                    setMessage('Account deleted.')
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : 'Delete failed')
                                  }
                                }
                              }}
                            >
                              Delete
                            </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {isAddingAccount ? (
                <tr>
                  <td>
                    <input
                      type="text"
                      placeholder="Account Name"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      style={{ padding: 4, width: '100%' }}
                    />
                  </td>
                  <td>
                    <div className="detailsActions" style={{ marginTop: 0 }}>
                      <button
                        className="btn btnGhost"
                        onClick={async () => {
                          if (!newName.trim()) return
                          try {
                            await api.createAccount({ name: newName })
                            await refreshAccounts()
                            setIsAddingAccount(false)
                            setNewName('')
                            setMessage('Account created.')
                          } catch (e) {
                            setError(e instanceof Error ? e.message : 'Create failed')
                          }
                        }}
                      >
                        Save
                      </button>
                      <button className="btn btnGhost" onClick={() => setIsAddingAccount(false)}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {!isAddingAccount && accounts.length < 3 && (
          <div style={{ marginTop: 12 }}>
            <button className="btn btnGhost" onClick={() => setIsAddingAccount(true)}>+ Add Account</button>
          </div>
        )}
      </div>

      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="panelTitle">Strategy tags</div>
        <div className="muted" style={{ marginBottom: 10 }}>Manage your trade strategies and tags.</div>
        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Tag Name</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map(st => {
                const isEditing = editingStId === st.id
                return (
                  <tr key={st.id}>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editStName}
                          onChange={e => setEditStName(e.target.value)}
                          style={{ padding: 4, width: '100%' }}
                        />
                      ) : (
                        <span className="statusPill" style={{ background: st.color || 'var(--accent-dim)', color: 'var(--text-strong)', border: 'none' }}>
                          {st.name}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="detailsActions" style={{ marginTop: 0 }}>
                        {isEditing ? (
                          <>
                            <button
                              className="btn btnGhost"
                              onClick={async () => {
                                if (!editStName.trim()) return
                                try {
                                  await api.updateStrategy(st.id, { name: editStName })
                                  await refetchStrategies()
                                  await qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] })
                                  setEditingStId(null)
                                  setMessage('Strategy updated.')
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : 'Update failed')
                                }
                              }}
                            >
                              Save
                            </button>
                            <button className="btn btnGhost" onClick={() => setEditingStId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btnGhost"
                              onClick={() => {
                                setEditingStId(st.id)
                                setEditStName(st.name)
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btnGhost"
                              style={{ color: '#ef4444' }}
                              onClick={async () => {
                                if (window.confirm(`Delete strategy "${st.name}"? This will remove it from all trades.`)) {
                                  try {
                                    await api.deleteStrategy(st.id)
                                    await refetchStrategies()
                                    await qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] })
                                    setMessage('Strategy deleted.')
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : 'Delete failed')
                                  }
                                }
                              }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {strategies.length === 0 && (
                <tr><td colSpan={2} className="muted text-center">No strategies defined yet. Add them in the Trade Journal.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="panelTitle">Appearance & Themes</div>
        <div className="muted" style={{ marginBottom: 16 }}>Personalize your workspace with a premium theme.</div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { id: 'default', label: 'Default Dark', color: '#0ea5e9' },
            { id: 'midnight', label: 'Midnight', color: '#8b5cf6' },
            { id: 'emerald', label: 'Emerald', color: '#10b981' },
            { id: 'ocean', label: 'Ocean', color: '#075985' },
            { id: 'medred', label: 'MedRed (Retro)', color: '#ec4899' },
            { id: 'light', label: 'Clean Light', color: '#3b82f6' },
          ].map(t => (
            <div 
              key={t.id}
              onClick={() => applyTheme(t.id)}
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid',
                borderColor: theme === t.id ? 'var(--accent)' : 'var(--border)',
                background: theme === t.id ? 'var(--accent-dim)' : 'var(--panel)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.color, margin: '0 auto 8px', boxShadow: theme === t.id ? `0 0 10px ${t.color}` : 'none' }}></div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: theme === t.id ? 'var(--text-strong)' : 'var(--muted2)' }}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card panel">
        <div className="panelTitle">Data management</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Download a full JSON backup before running destructive actions.
        </div>
        <div className="detailsActions">
          <button className="btn" disabled={isBusy} onClick={() => backupMutation.mutate()}>
            {backupMutation.isPending ? 'Preparing backup...' : 'Backup dataset'}
          </button>
          <label className="fileBtn" style={{ opacity: isBusy ? 0.4 : 1, pointerEvents: isBusy ? 'none' : 'auto' }}>
            <input 
              type="file" 
              accept=".json" 
              onChange={e => {
                const f = e.target.files?.[0]
                if (!f) return
                const ok = window.confirm('This will wipe all existing data for this account and replace it with the backup. Continue?')
                if (ok) restoreMutation.mutate(f)
                e.target.value = ''
              }} 
            />
            {restoreMutation.isPending ? 'Restoring...' : 'Restore from backup'}
          </label>
          <button
            className="btn btnGhost"
            disabled={isBusy}
            onClick={() => {
              const ok = window.confirm('Clear all trades, assets, lessons, psychology logs, and cash transactions?')
              if (!ok) return
              clearMutation.mutate()
            }}
          >
            {clearMutation.isPending ? 'Clearing...' : 'Clear dataset'}
          </button>
        </div>

        {message ? <div className="good" style={{ marginTop: 10 }}>{message}</div> : null}
        {error ? <div className="error">{error}</div> : null}
      </div>
    </div>
  )
}

