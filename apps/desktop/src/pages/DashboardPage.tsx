import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, Doughnut, Line, Radar } from 'react-chartjs-2'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { api, type OverviewResponse } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useAccount } from '../components/AccountContext'

// Read a CSS variable at runtime so charts adapt to theme switches
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function safeDiv(a: number, b: number) { return b === 0 ? 0 : a / b }

type ChartRange = '1m' | '3m' | '6m' | '1y' | 'all'

function filterSeriesByRange(
  labels: string[], portfolioValue: number[], netDeposited: number[],
  totalReturn: number[], liquidationValue: number[], range: ChartRange,
) {
  const liq = liquidationValue || []
  if (!labels.length || range === 'all') return { labels, portfolio_value: portfolioValue, net_deposited: netDeposited, total_return_value: totalReturn, portfolio_value_liquidation: liq }
  const last = labels[labels.length - 1]
  const end = new Date(last + 'T12:00:00')
  const start = new Date(end)
  const days = range === '1m' ? 30 : range === '3m' ? 91 : range === '6m' ? 183 : 365
  start.setDate(start.getDate() - days)
  const startStr = start.toISOString().slice(0, 10)
  let i = 0
  while (i < labels.length && labels[i] < startStr) i++
  return {
    labels: labels.slice(i),
    portfolio_value: portfolioValue.slice(i),
    net_deposited: netDeposited.slice(i),
    total_return_value: totalReturn.slice(i),
    portfolio_value_liquidation: liq.length ? liq.slice(i) : Array(labels.length - i).fill(null)
  }
}

const CHART_RANGES: { id: ChartRange; label: string }[] = [
  { id: '1m', label: '1M' }, { id: '3m', label: '3M' }, { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' }, { id: 'all', label: 'All' },
]

export function DashboardPage() {
  const { currentAccount } = useAccount()
  const qc = useQueryClient()
  const [chartRange, setChartRange] = useState<ChartRange>('6m')
  const [cashAmount, setCashAmount] = useState(1000)
  const [cashNote, setCashNote] = useState('')
  const [cashDate, setCashDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [depositMsg, setDepositMsg] = useState<string | null>(null)
  const [showCash, setShowCash] = useState(false)

  const { data: ov, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ['overview', currentAccount?.id],
    queryFn: () => api.overview(currentAccount?.id ?? 1),
  })

  const depositMutation = useMutation({
    mutationFn: (p: { amount: number; at?: string; note?: string }) => api.cashDeposit(p, currentAccount?.id ?? 1),
    onSuccess: async (data: any) => {
      await qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] })
      setCashNote('')
      const bal = data?.balance
      const txid = data?.tx_id
      setDepositMsg(txid != null ? `✓ Deposit ok — Balance: ${formatCurrency(Number(bal))}` : '✓ Deposit successful')
      setTimeout(() => setDepositMsg(null), 5000)
    },
    onError: (err: any) => { setDepositMsg(`✗ ${err?.message ?? 'Deposit failed'}`); setTimeout(() => setDepositMsg(null), 5000) },
  })

  const withdrawMutation = useMutation({
    mutationFn: (p: { amount: number; note?: string }) => api.cashWithdraw(p, currentAccount?.id ?? 1),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] }); setCashNote('') },
  })

  const cashAvailable = Number(ov?.kpis.cash_balance ?? 0)
  const netDeposited = Number(ov?.kpis.net_deposited ?? 0)
  const investedCapital = Number(ov?.kpis.assets_market_value ?? 0)
  const canWithdraw = cashAmount > 0 && cashAmount <= cashAvailable

  const computed = useMemo(() => {
    const trades = ov?.trades ?? []
    const closed = trades.filter(t => t.exit_price != null && t.pnl != null)
    const closedSorted = [...closed].sort((a, b) =>
      new Date(a.exit_date ?? a.entry_date).getTime() - new Date(b.exit_date ?? b.entry_date).getTime())
    const pnls = closedSorted.map(t => t.pnl ?? 0)
    const total = pnls.reduce((a, b) => a + b, 0)
    const wins = closed.filter(t => (t.pnl ?? 0) > 0)
    const losses = closed.filter(t => (t.pnl ?? 0) < 0)
    const winRate = safeDiv(wins.length, Math.max(1, closed.length)) * 100
    const grossWin = wins.reduce((s, t) => s + (t.pnl ?? 0), 0)
    const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0)
    const profitFactor = grossLoss === 0 ? (wins.length ? Infinity : 0) : grossWin / grossLoss
    const avgWin = wins.length ? safeDiv(grossWin, wins.length) : 0
    const avgLoss = losses.length ? safeDiv(grossLoss, losses.length) : 0

    // Sharpe Ratio (Simple: avg_pnl / std_dev_pnl)
    let sharpe = 0
    if (closed.length > 2) {
      const avg = total / closed.length
      const variance = pnls.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / closed.length
      const stdDev = Math.sqrt(variance)
      sharpe = stdDev === 0 ? 0 : avg / stdDev
    }

    // Max Drawdown (from Liquidation Equity Curve)
    const curve = ov?.chart.portfolio_value_liquidation ?? []
    let maxDd = 0
    let peak = -Infinity
    for (const val of curve) {
      if (val > peak) peak = val
      const dd = peak - val
      if (dd > 0 && dd > maxDd) maxDd = dd
    }

    const monthlyMap = new Map<string, number>()
    for (const t of closedSorted) {
      const dt = new Date(t.exit_date ?? t.entry_date)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + (t.pnl ?? 0))
    }
    const monthlyLabels = Array.from(monthlyMap.keys()).sort()
    const monthlyValues = monthlyLabels.map(k => monthlyMap.get(k) ?? 0)

    return { total, totalTrades: trades.length, closedTrades: closed.length, winRate, profitFactor, avgWin, avgLoss, monthlyLabels, monthlyValues, sharpe, maxDd }
  }, [ov])

  const realizedPnl = Number(ov?.kpis.realized_pnl_total ?? 0)
  const portfolioValue = Number(ov?.kpis.portfolio_value ?? 0) // Realized by default
  const totalReturnPct = Number(ov?.kpis.total_return_pct ?? 0)

  const chartFiltered = useMemo(() => {
    const labels = ov?.chart.labels ?? []
    const pvRaw = ov?.chart.portfolio_value ?? []
    const nd = ov?.chart.net_deposited ?? []
    const tr = ov?.chart.total_return_value ?? []
    const liq = ov?.chart.portfolio_value_liquidation ?? []
    return filterSeriesByRange(labels, pvRaw, nd, tr, liq, chartRange)
  }, [ov?.chart, chartRange])

  const isPositive = totalReturnPct != null && totalReturnPct >= 0

  return (
    <div className="page">
      {/* Header */}
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Dashboard</div>
          <div className="pageSubtitle">Portfolio overview & performance summary</div>
        </div>
        <div className="detailsActions">
          <div className="statusPill">EGX • Stocks</div>
          <OverviewSyncBar />
        </div>
      </div>

      {isLoading && <div className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>
        <div className="spinner" style={{ margin: '0 auto 10px' }} /> Loading dashboard…
      </div>}
      {error && <div className="riskBanner status-breached" style={{ marginBottom: 20 }}>
        <div className="riskBannerTitle">⚠ API Unavailable</div>
        <div className="muted">Start the API server at 127.0.0.1:8001 to load data.</div>
      </div>}

      {/* Hero KPI Cards */}
      {!isLoading && (
        <div className="dashHero" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className={`heroCard ${isPositive ? 'good' : 'bad'}`}>
            <div className="heroLabel">Portfolio Value</div>
            <div className="heroValue">{formatCurrency(portfolioValue)}</div>
            <div className="heroSub">Net Deposited + Realized P/L</div>
            {totalReturnPct != null && (
              <div className={`heroBadge ${totalReturnPct >= 0 ? 'up' : 'down'}`}>
                {totalReturnPct >= 0 ? '↑' : '↓'} {Math.abs(totalReturnPct).toFixed(2)}%
              </div>
            )}
          </div>

          <div className="heroCard">
            <div className="heroLabel">Invested Capital (Cost)</div>
            <div className="heroValue">{formatCurrency(investedCapital)}</div>
            <div className="heroSub">Total cost basis of open positions</div>
          </div>

          <div className={`heroCard ${realizedPnl >= 0 ? 'good' : 'bad'}`}>
            <div className="heroLabel">Realized P/L</div>
            <div className={`heroValue ${realizedPnl >= 0 ? 'good' : 'bad'}`}>{formatCurrency(realizedPnl)}</div>
            <div className="heroSub">Closed trades only</div>
          </div>

          <div className="heroCard">
            <div className="heroLabel">Sharpe Ratio</div>
            <div className={`heroValue ${computed.sharpe >= 1 ? 'good' : computed.sharpe > 0 ? 'accent' : 'bad'}`}>
              {computed.closedTrades < 3 ? '—' : computed.sharpe.toFixed(2)}
            </div>
            <div className="heroSub">Consistency score (target {'>'}1.0)</div>
          </div>

          <div className="heroCard">
            <div className="heroLabel">Net Deposit</div>
            <div className="heroValue">{formatCurrency(netDeposited)}</div>
            <div className="heroSub">Total cash capital</div>
          </div>
        </div>
      )/* Hero KPI Cards end */}


      {/* Stats Bar */}
      {!isLoading && (
        <div className="statsBar">
          <div className="statBarItem">
            <div className="statBarLabel">Win Rate</div>
            <div className={`statBarValue ${computed.winRate >= 50 ? 'good' : 'bad'}`}>
              {computed.closedTrades === 0 ? '—' : computed.winRate.toFixed(1) + '%'}
            </div>
          </div>
          <div className="statBarItem">
            <div className="statBarLabel">Profit Factor</div>
            <div className={`statBarValue ${computed.profitFactor >= 1.5 ? 'good' : computed.profitFactor < 1 ? 'bad' : ''}`}>
              {computed.closedTrades === 0 ? '—' : computed.profitFactor === Infinity ? '∞' : computed.profitFactor.toFixed(2)}
            </div>
          </div>
          <div className="statBarItem">
            <div className="statBarLabel">Total Trades</div>
            <div className="statBarValue accent">{computed.totalTrades}</div>
          </div>
          <div className="statBarItem">
            <div className="statBarLabel">Avg Win</div>
            <div className="statBarValue good">{computed.avgWin > 0 ? formatCurrency(computed.avgWin) : '—'}</div>
          </div>
          <div className="statBarItem">
            <div className="statBarLabel">Free Cash</div>
            <div className="statBarValue">{formatCurrency(cashAvailable)}</div>
          </div>
        </div>
      )}

      {/* Cash Actions */}
      <div className="sectionTitle">Cash Management</div>
      <div className="card panel" style={{ marginBottom: 24 }}>
        <div className="panelTitleRow">
          <div>
            <div className="panelTitle">Deposit / Withdraw</div>
            <div className="muted" style={{ fontSize: 12 }}>Available: <strong style={{ color: 'var(--text-strong)' }}>{formatCurrency(cashAvailable)}</strong></div>
          </div>
          <button type="button" className="btnGhost btn" onClick={() => setShowCash(v => !v)}>
            {showCash ? 'Hide' : 'Show'} form
          </button>
        </div>

        {showCash && (
          <div className="formGrid" style={{ marginTop: 12 }}>
            <label>
              <div className="label">Amount</div>
              <input type="number" value={cashAmount} onChange={e => setCashAmount(Number(e.target.value))} />
            </label>
            <label>
              <div className="label">Date</div>
              <input type="date" value={cashDate} onChange={e => setCashDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </label>
            <label className="span2">
              <div className="label">Note (optional)</div>
              <input value={cashNote} onChange={e => setCashNote(e.target.value)} placeholder="e.g. Monthly deposit" />
            </label>
            <div className="detailsActions" style={{ marginTop: 4 }}>
              <button type="button" className="btn" disabled={depositMutation.isPending || !(cashAmount > 0)}
                onClick={() => depositMutation.mutate({ amount: cashAmount, at: cashDate ? new Date(`${cashDate}T00:00:00`).toISOString() : undefined, note: cashNote.trim() || undefined })}>
                {depositMutation.isPending ? '⟳ Processing…' : '↑ Deposit'}
              </button>
              <button type="button" className="btn btnGhost" disabled={withdrawMutation.isPending || !canWithdraw}
                onClick={() => withdrawMutation.mutate({ amount: cashAmount, note: cashNote.trim() || undefined })}>
                {withdrawMutation.isPending ? '⟳ Processing…' : '↓ Withdraw'}
              </button>
              <button type="button" className="btn btnGhost" onClick={() => { setCashAmount(1000); setCashDate(new Date().toISOString().slice(0, 10)); setCashNote('') }}>Reset</button>
            </div>
            {depositMsg && (
              <div className={depositMsg.includes('✗') ? 'error' : 'good'} style={{ marginTop: 6, fontSize: 13 }}>{depositMsg}</div>
            )}
            {!canWithdraw && cashAmount > 0 && (
              <div className="error" style={{ fontSize: 12 }}>Insufficient cash (Available: {formatCurrency(cashAvailable)})</div>
            )}
          </div>
        )}
      </div>

      {/* Equity Chart */}
      <div className="sectionTitle">Equity Curve</div>
      <div className="card panel">
        <div className="panelTitleRow">
          <div>
            <div className="panelTitle">Portfolio Value (Realized) vs Net Deposited</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Realized growth: Net Deposited + Cumulative Realized P/L</div>
          </div>
          <div className="detailsActions">
            {CHART_RANGES.map(b => (
              <button key={b.id} type="button" className={`rangeBtn ${chartRange === b.id ? 'active' : ''}`} onClick={() => setChartRange(b.id)}>{b.label}</button>
            ))}
          </div>
        </div>
        <div className="chartWrapper">
          {chartFiltered.labels.length === 0
            ? <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>No history yet — add trades and deposits to see the chart.</div>
            : <Line
              data={{
                labels: chartFiltered.labels,
                datasets: [
                  { label: 'Portfolio (Realized)', data: chartFiltered.portfolio_value, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.08)', fill: true, pointRadius: 0, tension: 0.3 },
                  { label: 'Equity (Liquidation)', data: chartFiltered.portfolio_value_liquidation, borderColor: 'rgba(56,189,248,0.5)', borderDash: [4, 4], fill: false, pointRadius: 0, tension: 0.2 },
                  { label: 'Net Deposited', data: chartFiltered.net_deposited, borderColor: 'rgba(148,163,184,0.6)', borderDash: [6, 4], fill: false, pointRadius: 0, tension: 0.2 },
                  { label: 'Realized P/L', data: chartFiltered.total_return_value, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.05)', fill: false, pointRadius: 0, tension: 0.25 },
                ],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                  legend: { position: 'bottom', labels: { color: cssVar('--muted2', '#94a3b8'), usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } },
                  tooltip: { intersect: false, mode: 'index', backgroundColor: cssVar('--panel', 'rgba(4,9,20,0.95)'), titleColor: cssVar('--text-strong', '#f8fafc'), bodyColor: cssVar('--muted2', '#94a3b8'), borderColor: cssVar('--border', 'rgba(56,189,248,0.2)'), borderWidth: 1 },
                },
                scales: {
                  x: { ticks: { maxTicksLimit: 8, color: cssVar('--muted', '#64748b'), font: { size: 11 } }, grid: { color: cssVar('--border', 'rgba(148,163,184,0.06)') } },
                  y: { beginAtZero: false, ticks: { color: cssVar('--muted', '#64748b'), font: { size: 11 } }, grid: { color: cssVar('--border', 'rgba(148,163,184,0.06)') } },
                },
              }}
            />
          }
        </div>
      </div>

      {/* Monthly P&L */}
      <div className="sectionTitle">Monthly Performance</div>
      <div className="card panel">
        {computed.monthlyLabels.length === 0
          ? <div className="muted" style={{ padding: '30px 0', textAlign: 'center' }}>No closed trades yet.</div>
          : <div className="chartWrapper small">
            <Bar
              data={{
                labels: computed.monthlyLabels,
                datasets: [{
                  label: 'Monthly P/L',
                  data: computed.monthlyValues,
                  backgroundColor: computed.monthlyValues.map(v => v >= 0 ? 'rgba(16,185,129,0.5)' : 'rgba(244,63,94,0.5)'),
                  borderColor: computed.monthlyValues.map(v => v >= 0 ? 'rgba(16,185,129,0.9)' : 'rgba(244,63,94,0.9)'),
                  borderWidth: 1, borderRadius: 4,
                }],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { backgroundColor: cssVar('--panel', 'rgba(4,9,20,0.95)'), titleColor: cssVar('--text-strong', '#f8fafc'), bodyColor: cssVar('--muted2', '#94a3b8'), borderColor: cssVar('--border', 'rgba(56,189,248,0.2)'), borderWidth: 1 },
                },
                scales: {
                  x: { ticks: { maxTicksLimit: 12, color: cssVar('--muted', '#64748b'), font: { size: 11 } }, grid: { color: cssVar('--border', 'rgba(148,163,184,0.06)') } },
                  y: { ticks: { color: cssVar('--muted', '#64748b'), font: { size: 11 } }, grid: { color: cssVar('--border', 'rgba(148,163,184,0.06)') } },
                },
              }}
            />
          </div>
        }
      </div>

      {/* Portfolio Allocation */}
      {!isLoading && ov?.allocation && Object.keys(ov.allocation).length > 0 && (
        <>
          <div className="sectionTitle">Portfolio Allocation</div>
          <div className="grid panels" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div className="card panel">
              <div className="panelTitle">Asset Breakdown</div>
              <div style={{ position: 'relative', height: 260 }}>
                <Doughnut
                  data={{
                    labels: Object.keys(ov.allocation),
                    datasets: [{
                      data: Object.values(ov.allocation),
                      backgroundColor: ['#38bdf8', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4'],
                      borderColor: cssVar('--panel', '#0a1020'),
                      borderWidth: 2,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                      legend: { position: 'right', labels: { color: cssVar('--muted2', '#94a3b8'), font: { size: 12 }, padding: 16, usePointStyle: true } },
                      tooltip: { backgroundColor: cssVar('--panel', 'rgba(4,9,20,0.95)'), titleColor: cssVar('--text-strong', '#f8fafc'), bodyColor: cssVar('--muted2', '#94a3b8'), borderColor: cssVar('--border', 'rgba(56,189,248,0.2)'), borderWidth: 1 },
                    },
                  }}
                />
              </div>
            </div>

            <div className="card panel">
              <div className="panelTitle">Allocation Radar</div>
              <div style={{ height: 260 }}>
                <Radar 
                  data={{
                    labels: Object.keys(ov.allocation),
                    datasets: [{
                      label: 'Value',
                      data: Object.values(ov.allocation),
                      backgroundColor: 'rgba(56,189,248,0.2)',
                      borderColor: '#38bdf8',
                      borderWidth: 2,
                      pointBackgroundColor: '#38bdf8',
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      r: {
                        angleLines: { color: cssVar('--border', 'rgba(148,163,184,0.1)') },
                        grid: { color: cssVar('--border', 'rgba(148,163,184,0.1)') },
                        pointLabels: { color: cssVar('--muted2', '#94a3b8'), font: { size: 11 } },
                        ticks: { display: false }
                      }
                    },
                    plugins: { legend: { display: false } }
                  }}
                />
              </div>
            </div>

            <div className="card panel">
              <div className="panelTitle">Allocation Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                {(() => {
                  const total = Object.values(ov.allocation).reduce((a, b) => a + (b as number), 0)
                  return Object.entries(ov.allocation).map(([label, val], i) => {
                    const colors = ['#38bdf8', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4']
                    const pct = total > 0 ? ((val as number) / total) * 100 : 0
                    return (
                      <div key={label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
                          <span style={{ color: 'var(--text)' }}>{label}</span>
                          <span style={{ color: colors[i % colors.length] }}>{pct.toFixed(1)}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 999, background: colors[i % colors.length], transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  )
}

