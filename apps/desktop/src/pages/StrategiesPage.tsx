import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { api, type OverviewResponse, type Strategy } from '../lib/api'
import { formatCurrency, formatPct } from '../lib/format'
import { useAccount } from '../components/AccountContext'

export function StrategiesPage() {
  const { currentAccount } = useAccount()
  const { data: ov, isLoading, error } = useQuery<OverviewResponse>({ 
    queryKey: ['overview', currentAccount?.id], 
    queryFn: () => api.overview(currentAccount?.id ?? 1) 
  })
  
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const strategies = useMemo(() => {
    const seen = new Map<number, Strategy>()
    for (const t of ov?.trades ?? []) {
      for (const s of t.strategies ?? []) {
        seen.set(s.id, s)
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [ov])

  const strategyTrades = useMemo(() => {
    if (selectedIds.length === 0) return []
    return (ov?.trades ?? []).filter((t) => 
      selectedIds.every(id => t.strategies?.some(s => s.id === id))
    )
  }, [ov, selectedIds])

  const stats = useMemo(() => {
    const closed = strategyTrades.filter((t) => t.exit_price != null && t.pnl != null)
    const totalPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
    const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length
    return { 
      closed: closed.length, 
      total: strategyTrades.length, 
      totalPnl, 
      winRate: closed.length ? (wins / closed.length) * 100 : 0 
    }
  }, [strategyTrades])

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Strategies</div>
          <div className="pageSubtitle">Analyze performance and trade history by strategy tag</div>
        </div>
        <div className="detailsActions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <OverviewSyncBar />
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load strategies. Start the API server.</div> : null}

      <div className="card panel">
        <div className="panelTitleRow">
          <div className="panelTitle">Strategy Filter</div>
          {selectedIds.length > 0 && <button className="btn btnGhost" onClick={() => setSelectedIds([])}>Clear all</button>}
        </div>
        <div className="tagList" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {strategies.map(s => {
            const isActive = selectedIds.includes(s.id)
            return (
              <span 
                key={s.id} 
                className={`statusPill clickableTag ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setSelectedIds(prev => isActive ? prev.filter(id => id !== s.id) : [...prev, s.id])
                }}
              >
                {s.name}
              </span>
            )
          })}
          {strategies.length === 0 && <div className="muted">No strategies used in any trades yet.</div>}
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div className="card panel" style={{ marginTop: 12 }}>
          <div className="panelTitleRow">
            <div className="panelTitle">
              History for {selectedIds.map(id => {
                const s = strategies.find(st => st.id === id)
                return s ? (
                  <span key={s.id} className="statusPill">{s.name}</span>
                ) : null
              })}
            </div>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Matching Trades: <span className="mono">{stats.total}</span> • Closed: <span className="mono">{stats.closed}</span> • Total PnL:{' '}
            <span className={stats.totalPnl >= 0 ? 'good' : 'bad'}>{formatCurrency(stats.totalPnl)}</span> • Win rate:{' '}
            <span className="mono">{formatPct(stats.winRate)}</span>
          </div>
          <div className="tableWrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Symbol</th>
                  <th>Status</th>
                  <th>Entry date</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Size</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {strategyTrades.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.id}</td>
                    <td className="mono">{t.symbol}</td>
                    <td className="mono">{t.exit_price == null ? 'OPEN' : 'CLOSED'}</td>
                    <td className="mono">{t.entry_date.slice(0, 10)}</td>
                    <td className="mono">{t.entry_price}</td>
                    <td className="mono">{t.exit_price ?? '—'}</td>
                    <td className="mono">{t.position_size}</td>
                    <td className={t.pnl != null && t.pnl >= 0 ? 'good' : 'bad'}>{t.pnl == null ? '—' : formatCurrency(t.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="muted" style={{ marginTop: 20, textAlign: 'center' }}>Select a strategy tag above to see its performance.</div>
      )}
    </div>
  )
}
