import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { api, type OverviewResponse } from '../lib/api'
import { formatCurrency, formatPct } from '../lib/format'

export function SymbolsPage() {
  const { data: ov, isLoading, error } = useQuery<OverviewResponse>({ queryKey: ['overview'], queryFn: () => api.overview() })
  const [selectedSymbol, setSelectedSymbol] = useState<string>('')

  const symbols = useMemo(() => {
    const uniq = new Set<string>()
    for (const t of ov?.trades ?? []) uniq.add(t.symbol.toUpperCase())
    return Array.from(uniq).sort()
  }, [ov])

  const symTrades = useMemo(() => {
    const s = selectedSymbol.trim().toUpperCase()
    if (!s) return []
    return (ov?.trades ?? []).filter((t) => t.symbol.toUpperCase() === s)
  }, [ov, selectedSymbol])

  const stats = useMemo(() => {
    const closed = symTrades.filter((t) => t.exit_price != null && t.pnl != null)
    const totalPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
    const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length
    return { closed: closed.length, total: symTrades.length, totalPnl, winRate: closed.length ? (wins / closed.length) * 100 : 0 }
  }, [symTrades])

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Symbols</div>
          <div className="pageSubtitle">Search symbol and review complete trade history</div>
        </div>
        <div className="detailsActions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <OverviewSyncBar />
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load symbols. Start the API server.</div> : null}

      <div className="card panel">
        <div className="panelTitle">Symbol search</div>
        <input list="allSymbols" value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value.toUpperCase())} placeholder="Type symbol..." />
        <datalist id="allSymbols">
          {symbols.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      {selectedSymbol ? (
        <div className="card panel" style={{ marginTop: 12 }}>
          <div className="panelTitle">History for {selectedSymbol.toUpperCase()}</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Trades: <span className="mono">{stats.total}</span> • Closed: <span className="mono">{stats.closed}</span> • Total PnL:{' '}
            <span className={stats.totalPnl >= 0 ? 'good' : 'bad'}>{formatCurrency(stats.totalPnl)}</span> • Win rate:{' '}
            <span className="mono">{formatPct(stats.winRate)}</span>
          </div>
          <div className="tableWrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Entry date</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Size</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {symTrades.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.id}</td>
                    <td className="mono">{t.exit_price == null ? 'OPEN' : 'CLOSED'}</td>
                    <td className="mono">{t.entry_date.slice(0, 10)}</td>
                    <td className="mono">{t.entry_price}</td>
                    <td className="mono">{t.exit_price ?? '—'}</td>
                    <td className="mono">{t.position_size}</td>
                    <td className={t.pnl != null && t.pnl >= 0 ? 'good' : 'bad'}>{t.pnl == null ? '—' : formatCurrency(t.pnl)}</td>
                  </tr>
                ))}
                {symTrades.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      No trades for this symbol.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
