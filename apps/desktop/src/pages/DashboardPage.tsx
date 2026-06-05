import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { MarketStatusPill } from '../components/MarketStatusPill'
import { api, type OverviewResponse, type MarketStatus } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useAccount } from '../components/AccountContext'

// Read a CSS variable at runtime so charts adapt to theme switches
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function safeDiv(a: number, b: number) { return b === 0 ? 0 : a / b }

type ChartRange = '1m' | '3m' | '6m' | '1y' | 'all' | 'custom'

function filterSeriesByRange(
  labels: string[], portfolioValue: number[], netDeposited: number[],
  totalReturn: number[], liquidationValue: number[], range: ChartRange,
  customStart?: string, customEnd?: string
) {
  const liq = liquidationValue || []
  if (!labels.length) return { labels, portfolio_value: portfolioValue, net_deposited: netDeposited, total_return_value: totalReturn, portfolio_value_liquidation: liq }
  
  let i = 0
  let j = labels.length

  if (range === 'custom' && customStart && customEnd) {
    while (i < labels.length && labels[i] < customStart) i++
    while (j > 0 && labels[j - 1] > customEnd) j--
    if (i >= j) { i = 0; j = labels.length; } // fallback if invalid
  } else if (range !== 'all') {
    const last = labels[labels.length - 1]
    const end = new Date(last + 'T12:00:00')
    const start = new Date(end)
    const days = range === '1m' ? 30 : range === '3m' ? 91 : range === '6m' ? 183 : 365
    start.setDate(start.getDate() - days)
    const startStr = start.toISOString().slice(0, 10)
    while (i < labels.length && labels[i] < startStr) i++
  }
  
  return {
    labels: labels.slice(i, j),
    portfolio_value: portfolioValue.slice(i, j),
    net_deposited: netDeposited.slice(i, j),
    total_return_value: totalReturn.slice(i, j),
    portfolio_value_liquidation: liq.length ? liq.slice(i, j) : Array(j - i).fill(null)
  }
}

const CHART_RANGES: { id: ChartRange; label: string }[] = [
  { id: '1m', label: '1M' }, { id: '3m', label: '3M' }, { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' }, { id: 'all', label: 'All' }, { id: 'custom', label: 'Custom' }
]

export function DashboardPage() {
  const { currentAccount } = useAccount()

  const [chartRange, setChartRange] = useState<ChartRange>('6m')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')


  const { data: ov, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ['overview', currentAccount?.id],
    queryFn: () => api.overview(currentAccount?.id ?? 1),
  })

  const { data: marketStatus } = useQuery<MarketStatus>({
    queryKey: ['market-status'],
    queryFn: () => api.getMarketStatus(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  void marketStatus



  const cashAvailable = Number(ov?.kpis.cash_balance ?? 0)
  const netDeposited = Number(ov?.kpis.net_deposited ?? 0)
  const investedCapital = Number(ov?.kpis.assets_market_value ?? 0)


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
    const monthlyLabelsAll = Array.from(monthlyMap.keys()).sort()

    // Filter monthly bars to the active chart range (same as equity curve)
    const filterMonthlyByRange = (labels: string[], range: ChartRange, customStart?: string, customEnd?: string): string[] => {
      if (!labels.length) return []
      let filtered = labels
      if (range === 'custom' && customStart && customEnd) {
        const startMonth = customStart.slice(0, 7)
        const endMonth = customEnd.slice(0, 7)
        filtered = labels.filter(l => l >= startMonth && l <= endMonth)
      } else if (range !== 'all') {
        const last = labels[labels.length - 1]
        const end = new Date(last + '-01')
        const start = new Date(end)
        const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12
        start.setMonth(start.getMonth() - months + 1)
        const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
        filtered = labels.filter(l => l >= startStr).slice(-6)
      }
      return filtered
    }

    const monthlyLabels = filterMonthlyByRange(monthlyLabelsAll, chartRange, customStart, customEnd)
    const monthlyValues = monthlyLabels.map(k => monthlyMap.get(k) ?? 0)

    return { total, totalTrades: trades.length, closedTrades: closed.length, winRate, profitFactor, avgWin, avgLoss, monthlyLabels, monthlyValues, sharpe, maxDd }
  }, [ov, chartRange, customStart, customEnd])


  const realizedPnl = Number(ov?.kpis.realized_pnl_total ?? 0)
  const portfolioValue = Number(ov?.kpis.portfolio_value ?? 0) // Realized by default
  const totalReturnPct = Number(ov?.kpis.total_return_pct ?? 0)

  const chartFiltered = useMemo(() => {
    const labels = ov?.chart.labels ?? []
    const pvRaw = ov?.chart.portfolio_value ?? []
    const nd = ov?.chart.net_deposited ?? []
    const tr = ov?.chart.total_return_value ?? []
    const liq = ov?.chart.portfolio_value_liquidation ?? []
    return filterSeriesByRange(labels, pvRaw, nd, tr, liq, chartRange, customStart, customEnd)
  }, [ov?.chart, chartRange, customStart, customEnd])

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
          <MarketStatusPill />
          <OverviewSyncBar />
        </div>
      </div>

      {isLoading && <div className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>
        <div className="spinner" style={{ margin: '0 auto 10px' }} /> Loading dashboard…
      </div>}
      {error && <div className="riskBanner status-breached">
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



      {/* Equity Chart */}
      <div className="sectionTitle">Equity Curve</div>
      <div className="card panel">
        <div className="panelTitleRow">
          <div>
            <div className="panelTitle">Portfolio Value (Realized) vs Net Deposited</div>
            <div className="muted">Realized growth: Net Deposited + Cumulative Realized P/L</div>
          </div>
          <div className="detailsActions">
            {CHART_RANGES.map(b => (
              <button key={b.id} type="button" className={`rangeBtn ${chartRange === b.id ? 'active' : ''}`} onClick={() => setChartRange(b.id)}>{b.label}</button>
            ))}
            {chartRange === 'custom' && (
              <div className="customDateRange">
                <input type="date" className="miniInput" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                <input type="date" className="miniInput" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            )}
          </div>
        </div>
        <div className="chartWrapper">
          {chartFiltered.labels.length === 0
            ? <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>No history yet — add trades and deposits to see the chart.</div>
            : <Line
              data={{
                labels: chartFiltered.labels,
                datasets: [
                  { label: 'Portfolio (Realized)', data: chartFiltered.portfolio_value, borderColor: '#8719e0', backgroundColor: 'rgba(135,25,224,0.08)', fill: true, pointRadius: 0, tension: 0.3 },
                  { label: 'Net Deposited', data: chartFiltered.net_deposited, borderColor: 'rgba(98,125,152,0.6)', borderDash: [6, 4], fill: false, pointRadius: 0, tension: 0.2 },
                  { label: 'Realized P/L', data: chartFiltered.total_return_value, borderColor: '#147d64', backgroundColor: 'rgba(20,125,100,0.05)', fill: false, pointRadius: 0, tension: 0.25 },
                ],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                  legend: { position: 'bottom', labels: { color: cssVar('--muted2', '#94a3b8'), usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } },
                  tooltip: { intersect: false, mode: 'index', backgroundColor: cssVar('--panel', 'rgba(4,9,20,0.95)'), titleColor: cssVar('--text-strong', '#f8fafc'), bodyColor: cssVar('--muted2', '#94a3b8'), borderColor: '#d9e2ec', borderWidth: 1 },
                },
                scales: {
                  x: { ticks: { maxTicksLimit: 8, color: '#627d98', font: { size: 11 } }, grid: { color: '#d9e2ec' } },
                  y: { beginAtZero: false, ticks: { color: '#627d98', font: { size: 11 } }, grid: { color: '#d9e2ec' } },
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
                  backgroundColor: computed.monthlyValues.map(v => v >= 0 ? 'rgba(20,125,100,0.6)' : 'rgba(225,45,57,0.6)'),
                  borderColor: computed.monthlyValues.map(v => v >= 0 ? 'rgba(20,125,100,0.9)' : 'rgba(225,45,57,0.9)'),
                  borderWidth: 1, borderRadius: 4,
                }],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { backgroundColor: cssVar('--panel', 'rgba(4,9,20,0.95)'), titleColor: cssVar('--text-strong', '#f8fafc'), bodyColor: cssVar('--muted2', '#94a3b8'), borderColor: '#d9e2ec', borderWidth: 1 },
                },
                scales: {
                  x: { ticks: { maxTicksLimit: 12, color: '#627d98', font: { size: 11 } }, grid: { color: '#d9e2ec' } },
                  y: { ticks: { color: '#627d98', font: { size: 11 } }, grid: { color: '#d9e2ec' } },
                },
              }}
            />
          </div>
        }
      </div>

      {/* Portfolio Allocation */}
      {!isLoading && ov?.allocation && Object.keys(ov.allocation).length > 0 && (
        <>
          <div className="sectionTitle">Portfolio Diversification</div>
          <div className="card panel allocationCard">
            <div className="allocationGrid">
              
              <div className="allocationSection">
                <div className="panelTitle allocationTitle">Asset Mix</div>
                <div className="donutContainer">
                  <Doughnut
                    data={{
                      labels: Object.keys(ov.allocation),
                      datasets: [{
                        data: Object.values(ov.allocation),
                        backgroundColor: ['#8719e0', '#147d64', '#e12d39', '#627d98', '#d9e2ec', '#0a6e5c'],
                        borderColor: 'var(--panel)',
                        borderWidth: 3,
                      }],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      cutout: '75%',
                      plugins: {
                        legend: { display: false },
                        tooltip: { 
                          backgroundColor: 'var(--panel)',
                          borderColor: 'var(--border)',
                          borderWidth: 1,
                          padding: 12,
                          titleColor: 'var(--text-strong)',
                          bodyColor: 'var(--muted2)',
                        },
                      },
                    }}
                  />
                  <div className="donutOverlay">
                    <div className="donutOverlayLabel">Assets</div>
                    <div className="donutOverlayValue">{Object.keys(ov.allocation).length}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="panelTitle allocationTitle">Concentration</div>
                <div className="concentrationBars">
                  {(() => {
                    const total = Object.values(ov.allocation).reduce((a, b) => a + (b as number), 0)
                    return Object.entries(ov.allocation).slice(0, 5).map(([label, val], i) => {
                      const colors = ['#8719e0', '#147d64', '#e12d39', '#627d98', '#d9e2ec', '#0a6e5c']
                      const pct = total > 0 ? ((val as number) / total) * 100 : 0
                      return (
                        <div key={label}>
                          <div className="concentrationBarHeader">
                            <span className="concentrationBarLabel">{label}</span>
                            <span className="concentrationBarPct" style={{ color: colors[i % colors.length] }}>{pct.toFixed(1)}%</span>
                          </div>
                          <div className="concentrationBarTrack">
                            <div className="concentrationBarFill" style={{ width: `${Math.min(100, pct)}%`, background: colors[i % colors.length] }} />
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              <div className="allocationSection healthScoreSection">
                <div className="panelTitle allocationTitle">Health Score</div>
                <div className="healthScoreContent">
                  <div className="healthScoreValue" style={{ color: '#147d64' }}>84</div>
                  <div className="muted healthScoreSubtitle">Optimal Diversification</div>
                </div>
                <div className="muted healthScoreDescription">
                  Your portfolio concentration is well-balanced across {Object.keys(ov.allocation).length} different assets.
                </div>
              </div>

            </div>
          </div>
        </>
      )}

    </div>
  )
}

