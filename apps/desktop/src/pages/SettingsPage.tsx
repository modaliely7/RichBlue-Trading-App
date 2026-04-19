import { useState } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
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

  // Account Management State
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [newName, setNewName] = useState('')

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="panelTitle">Account management</div>
          {!isAddingAccount && accounts.length < 5 && (
            <button className="btn btnGhost" style={{ padding: '4px 8px', fontSize: '0.85rem' }} onClick={() => setIsAddingAccount(true)}>+ Add Account</button>
          )}
          {accounts.length >= 5 && <span className="muted" style={{ fontSize: '0.8rem' }}>Limit reached (5)</span>}
        </div>

        <div className="tableWrap">
          <table className="table tableCompact">
            <thead>
              <tr>
                <th>Account Name</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
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
                          style={{ padding: '2px 6px', width: '100%' }}
                          autoFocus
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {acc.name}
                          {acc.is_main && <span style={{ fontSize: '0.7rem', padding: '1px 4px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', borderRadius: 4, fontWeight: 600 }}>MAIN</span>}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="detailsActions" style={{ marginTop: 0, justifyContent: 'flex-end', gap: 4 }}>
                        {isEditing ? (
                          <>
                            <button
                              className="btn btnGhost"
                              style={{ padding: '2px 8px' }}
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
                            <button className="btn btnGhost" style={{ padding: '2px 8px' }} onClick={() => setEditingAccountId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btnGhost"
                              style={{ padding: '2px 8px' }}
                              onClick={() => {
                                setEditingAccountId(acc.id)
                                setEditName(acc.name)
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btnGhost"
                              style={{ padding: '2px 8px', color: acc.is_main ? '#9ca3af' : '#ef4444', opacity: acc.is_main ? 0.5 : 1 }}
                              disabled={acc.is_main}
                              title={acc.is_main ? "Cannot delete the main account" : "Delete account"}
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
                      style={{ padding: '2px 6px', width: '100%' }}
                      autoFocus
                    />
                  </td>
                  <td>
                    <div className="detailsActions" style={{ marginTop: 0, justifyContent: 'flex-end', gap: 4 }}>
                      <button
                        className="btn btnGhost"
                        style={{ padding: '2px 8px' }}
                        onClick={async () => {
                          if (!newName.trim()) return
                          try {
                            await api.createAccount({ name: newName, is_main: false, is_active: true })
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
                      <button className="btn btnGhost" style={{ padding: '2px 8px' }} onClick={() => setIsAddingAccount(false)}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="panelTitle">Appearance</div>
        <div style={{ marginTop: 10 }}>
          <label>
            <div className="label">Theme</div>
            <select value={theme} onChange={e => applyTheme(e.target.value)} style={{ padding: 6, minWidth: 200 }}>
              <option value="default">Default</option>
              <option value="medred">MedRed (Neo-Brutalism)</option>
            </select>
          </label>
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

