import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

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
  const qc = useQueryClient()
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')

  const backupMutation = useMutation({
    mutationFn: api.backupDataset,
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
    mutationFn: api.clearDataset,
    onSuccess: async (res) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['overview'] }),
        qc.invalidateQueries({ queryKey: ['assets'] }),
        qc.invalidateQueries({ queryKey: ['psychology'] }),
        qc.invalidateQueries({ queryKey: ['psychologySummary'] }),
        qc.invalidateQueries({ queryKey: ['lessons'] }),
        qc.invalidateQueries({ queryKey: ['insights'] }),
        qc.invalidateQueries({ queryKey: ['trades'] }),
        qc.invalidateQueries({ queryKey: ['performanceAnalytics'] }),
      ])
      setError('')
      setMessage(
        `Dataset cleared. Trades: ${res.deleted.trades ?? 0}, assets: ${res.deleted.assets ?? 0}, psychology: ${res.deleted.psychology_entries ?? 0}, lessons: ${res.deleted.lessons ?? 0}.`,
      )
    },
    onError: (e) => {
      setMessage('')
      setError(e instanceof Error ? e.message : 'Clear dataset failed')
    },
  })

  const isBusy = backupMutation.isPending || clearMutation.isPending

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Settings</div>
          <div className="pageSubtitle">Manage backup and maintenance actions.</div>
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

