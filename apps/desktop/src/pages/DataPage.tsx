import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAccount } from '../components/AccountContext'
import { OverviewSyncBar } from '../components/OverviewSyncBar'

export function DataPage() {
  const { currentAccount } = useAccount()
  const qc = useQueryClient()
  const [importStatus, setImportStatus] = useState<string>('')

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importTradesCsv(file, currentAccount?.id ?? 1),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] })
      setImportStatus('Import successful!')
      setTimeout(() => setImportStatus(''), 3000)
    },
    onError: () => {
      setImportStatus('Import failed. Check CSV format.')
    }
  })

  const exportCsv = async () => {
    try {
      const blob = await api.exportTradesCsv(currentAccount?.id ?? 1)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trades_export_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      alert('Export failed.')
    }
  }

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Data Management</div>
          <div className="pageSubtitle">Import or export your trade data for backup or analysis</div>
        </div>
        <div className="detailsActions">
          <OverviewSyncBar />
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 20 }}>
        <div className="card panel">
          <div className="panelTitle">Export Data</div>
          <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
            Download all your trades for this account in a standardized CSV format.
          </p>
          <button className="btn" onClick={exportCsv}>
            Download CSV Export
          </button>
        </div>

        <div className="card panel">
          <div className="panelTitle">Import Data</div>
          <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
            Upload a CSV file to import trades. Ensure the columns match the exported format.
          </p>
          <label className="fileBtn">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                importMutation.mutate(f)
                e.target.value = ''
              }}
            />
            {importMutation.isPending ? 'Importing...' : 'Upload CSV File'}
          </label>
          {importStatus && (
            <div className={importMutation.isError ? 'error' : 'good'} style={{ marginTop: 10, fontSize: 13 }}>
              {importStatus}
            </div>
          )}
        </div>
      </div>

      <div className="card panel" style={{ marginTop: 24, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
        <div className="panelTitle" style={{ color: 'var(--bad)' }}>Danger Zone</div>
        <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
          These actions are permanent and cannot be undone.
        </p>
        <button 
          className="btn btnGhost" 
          style={{ color: 'var(--bad)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
          onClick={() => {
            if (confirm('Are you sure you want to clear all trades for this account? This will also affect your performance metrics.')) {
              // Implementation for clearing trades would go here if backend supported it
              alert('Feature coming soon.')
            }
          }}
        >
          Clear All Trades
        </button>
      </div>
    </div>
  )
}
