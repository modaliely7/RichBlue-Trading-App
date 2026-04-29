import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pie, Line } from 'react-chartjs-2'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { api } from '../lib/api'
import type { HoldingRow } from '../lib/api'
import { formatCurrency, formatPct } from '../lib/format'
import { useAccount } from '../components/AccountContext'
import '../lib/charts'

function pieSliceColors(n: number): { bg: string[]; border: string[] } {
  const bg: string[] = []
  const border: string[] = []
  for (let i = 0; i < n; i += 1) {
    const h = Math.round((360 * i) / Math.max(n, 1))
    bg.push(`hsla(${h}, 52%, 42%, 0.75)`)
    border.push(`hsla(${h}, 55%, 58%, 0.95)`)
  }
  return { bg, border }
}

export function PortfolioPage() {
  const { currentAccount } = useAccount()
  const [method, setMethod] = useState<string>('realized')
  const [pnlPeriod, setPnlPeriod] = useState<string>('ALL')
  
  const { data: ov, isLoading, error } = useQuery({ 
    queryKey: ['overview', currentAccount?.id, method], 
    queryFn: () => api.overview(currentAccount?.id ?? 1, method) 
  })

  const holdings = useMemo(() => ov?.holdings ?? [], [ov])
  const openHoldings = useMemo(
    () =>
      holdings
        .filter((h) => Number(h.open_quantity ?? 0) > 0)
        .sort((a, b) => Number(b.open_cost_basis ?? 0) - Number(a.open_cost_basis ?? 0)),
    [holdings],
  )

  const metrics = useMemo(() => {
    const cash = Number(ov?.kpis.cash_balance ?? 0)
    const netDep = Number(ov?.kpis.net_deposited ?? 0)
    const realizedPnl = Number(ov?.kpis.realized_pnl_total ?? 0)
    const assetsCost = Number(ov?.kpis.assets_market_value ?? 0)
    
    const pv = Number(ov?.kpis.portfolio_value ?? 0)
    const totalPnL = Number(ov?.kpis.total_return_value ?? 0)
    const returnPct = Number(ov?.kpis.total_return_pct ?? 0)
    
    // Ledger validation (Cash + Cost Basis should equal Net Dep + Realized PnL)
    const realizedFromLedger = cash + assetsCost
    const realizedFromPnL = netDep + realizedPnl
    const mismatch = Math.abs(realizedFromLedger - realizedFromPnL) > 0.01
    
    return { pv, totalPnL, returnPct, realizedFromLedger, realizedFromPnL, mismatch, netDep, realizedPnl, cash, assetsCost }
  }, [ov])

  const portfolioPie = useMemo(() => {
    const cashVal = metrics.cash
    const labels: string[] = []
    const values: number[] = []
    if (cashVal > 1e-9) {
      labels.push('Cash')
      values.push(cashVal)
    }
    for (const h of openHoldings) {
      const v = Number((method === 'liquidation' ? h.market_value : h.open_cost_basis) ?? 0)
      if (v > 1e-9) {
        labels.push(h.symbol)
        values.push(v)
      }
    }
    // Add individual fund symbols from fund_allocation dict
    const stockSymbols = new Set(openHoldings.map(h => h.symbol))
    const fundAlloc = ov?.fund_allocation ?? {}
    for (const [sym, val] of Object.entries(fundAlloc)) {
      if (stockSymbols.has(sym)) continue // already in holdings
      if (Number(val) > 1e-9) {
        labels.push(sym)
        values.push(Number(val))
      }
    }
    const total = values.reduce((a, b) => a + b, 0)
    const pct = total > 0 ? values.map((v) => (v / total) * 100) : []
    const { bg, border } = pieSliceColors(labels.length)
    return { labels, values, pct, total, bg, border }
  }, [metrics.cash, openHoldings, method, ov?.fund_allocation])

  const earningsChart = useMemo(() => {
    if (!ov?.chart) return null
    const labels = ov.chart.labels
    // total_pnl includes unrealized, total_return_value is realized only
    const values = (method === 'liquidation' && ov.chart.total_pnl) ? ov.chart.total_pnl : ov.chart.total_return_value
    
    if (pnlPeriod === 'ALL' || !labels.length) return { labels, values }
    
    const now = new Date()
    let start = new Date()
    if (pnlPeriod === '1M') start.setMonth(now.getMonth() - 1)
    else if (pnlPeriod === '6M') start.setMonth(now.getMonth() - 6)
    else if (pnlPeriod === '1Y') start.setFullYear(now.getFullYear() - 1)
    else if (pnlPeriod === 'YTD') start = new Date(now.getFullYear(), 0, 1)
    
    const indices = labels.map((l, i) => (new Date(l) >= start ? i : -1)).filter(i => i !== -1)
    return {
      labels: indices.map(i => labels[i]),
      values: indices.map(i => values[i])
    }
  }, [ov?.chart, pnlPeriod, method])

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Portfolio</div>
          <div className="pageSubtitle">Cash plus the cost of what you own (from trades and fund positions)</div>
        </div>
        <div className="detailsActions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <OverviewSyncBar />
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ marginLeft: 12 }}>
              <option value="realized">Realized view</option>
              <option value="liquidation">With unrealized (liquidation)</option>
            </select>
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load portfolio. Start the API server.</div> : null}

      <div className="grid kpis">
        <div className="card kpi">
          <div className="kpiLabel">Portfolio value</div>
          <div className="kpiValue">{formatCurrency(metrics.pv)}</div>
          <div className="kpiSub">{method === 'realized' ? 'Net Deposited + Realized P/L' : 'Cash + Market Value'}</div>
        </div>
        <div className="card kpi">
          <div className="kpiLabel">Free cash</div>
          <div className="kpiValue">{formatCurrency(metrics.cash)}</div>
          <div className="kpiSub">Cash ledger balance</div>
        </div>
        <div className="card kpi">
          <div className="kpiLabel">Invested Capital (Cost)</div>
          <div className="kpiValue">{formatCurrency(metrics.assetsCost)}</div>
          <div className="kpiSub">Open positions cost basis</div>
        </div>
        <div className="card kpi">
          <div className="kpiLabel">Net deposited</div>
          <div className="kpiValue">{formatCurrency(metrics.netDep)}</div>
          <div className="kpiSub">Deposits − withdrawals</div>
        </div>
        <div className="card kpi">
          <div className="kpiLabel">Total PnL</div>
          <div className={`kpiValue ${metrics.totalPnL >= 0 ? 'good' : 'bad'}`}>
            {formatCurrency(metrics.totalPnL)}
          </div>
          <div className="kpiSub">Portfolio Value − Net Deposited</div>
        </div>
        <div className="card kpi">
          <div className="kpiLabel">Return %</div>
          <div className="kpiValue">{formatPct(metrics.returnPct)}</div>
          <div className="kpiSub">On net deposited</div>
        </div>
        <div className="card kpi">
          <div className="kpiLabel">Realized P/L (closed)</div>
          <div className={`kpiValue ${metrics.realizedPnl >= 0 ? 'good' : 'bad'}`}>
            {formatCurrency(metrics.realizedPnl)}
          </div>
          <div className="kpiSub">Sum of closed trades only</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 12, marginTop: 12 }}>
        <div className="card panel">
          <div className="panelTitle">Portfolio mix (pie)</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Current allocation: cash + holdings at cost (or market value).
          </div>
          {portfolioPie.total <= 0 ? (
            <div className="muted" style={{ marginTop: 16 }}>No cash or positions yet.</div>
          ) : (
            <>
              <div className="chartWrapper" style={{ maxWidth: 380, margin: '16px auto 0', height: 280 }}>
                <Pie
                  data={{
                    labels: portfolioPie.labels,
                    datasets: [{
                      data: portfolioPie.values,
                      backgroundColor: portfolioPie.bg,
                      borderColor: portfolioPie.border,
                      borderWidth: 1,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'right', labels: { color: 'rgba(148,163,184,0.95)', boxWidth: 12 } },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const v = Number(ctx.raw ?? 0)
                            const idx = ctx.dataIndex
                            return `${ctx.label}: ${formatCurrency(v)} (${formatPct(portfolioPie.pct[idx] ?? 0)})`
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
              <div className="muted" style={{ marginTop: 10, textAlign: 'center', fontSize: 13 }}>
                Pie total: <span className="mono">{formatCurrency(portfolioPie.total)}</span>
              </div>
            </>
          )}
        </div>

        <div className="card panel">
          <div className="panelHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="panelTitle">Portfolio Earnings</div>
            <div className="periodSelect">
              {['1M', '6M', '1Y', 'YTD', 'ALL'].map(p => (
                <button 
                  key={p} 
                  className={`btn-small ${pnlPeriod === p ? 'active' : ''}`}
                  onClick={() => setPnlPeriod(p)}
                  style={{ marginLeft: 4, padding: '2px 8px', fontSize: 11 }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Cumulative {method === 'realized' ? 'Realized PnL' : 'Total PnL (inc. unrealized)'} over time.
          </div>
          {!earningsChart || !earningsChart.labels.length ? (
            <div className="muted" style={{ marginTop: 16 }}>No earnings data for this period.</div>
          ) : (
            <div className="chartWrapper" style={{ marginTop: 16, height: 280 }}>
              <Line
                data={{
                  labels: earningsChart.labels,
                  datasets: [{
                    label: 'Earnings',
                    data: earningsChart.values,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: { display: false },
                    y: { 
                      grid: { color: 'rgba(255,255,255,0.05)' },
                      ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }
                    }
                  },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `${formatCurrency(Number(ctx.raw ?? 0))}`
                      }
                    }
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>

      {metrics.mismatch && method === 'realized' ? (
        <div className="error" style={{ marginTop: 12, fontSize: 13, textAlign: 'center' }}>
          Pie total {formatCurrency(metrics.realizedFromLedger)} ≠ realized portfolio value {formatCurrency(metrics.realizedFromPnL)}. Check fund positions.
        </div>
      ) : null}

      <div className="card panel" style={{ marginTop: 12 }}>
        <div className="panelTitle">Positions by symbol</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Reference price per row is your <strong>average open cost</strong> (buying price from trades). Open cost basis is quantity × that average plus entry fees already rolled in.
        </div>
        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Open Qty</th>
                <th>Avg open cost (reference price)</th>
                <th>Open cost basis</th>
              </tr>
            </thead>
            <tbody>
              {openHoldings.map((h: HoldingRow) => (
                <tr key={h.symbol}>
                  <td className="mono">{h.symbol}</td>
                  <td className="mono">{h.open_quantity}</td>
                  <td className="mono">{h.avg_open_cost == null ? '—' : h.avg_open_cost.toFixed(4)}</td>
                  <td className="mono">{formatCurrency(h.open_cost_basis)}</td>
                </tr>
              ))}
              {openHoldings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No open positions yet. Add trades on the Trades tab.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
