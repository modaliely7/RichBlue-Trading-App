import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pie, Doughnut, Line } from 'react-chartjs-2'
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
  const qc = useQueryClient()
  const [method, setMethod] = useState<string>('realized')
  const [pnlPeriod, setPnlPeriod] = useState<string>('ALL')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')

  const { data: ov, isLoading, error } = useQuery({
    queryKey: ['overview', currentAccount?.id, method],
    queryFn: () => api.overview(currentAccount?.id ?? 1, method)
  })

  const [dividendSymbol, setDividendSymbol] = useState<string | null>(null)
  const [dividendAmount, setDividendAmount] = useState<string>('')
  const [isSubmittingDiv, setIsSubmittingDiv] = useState(false)

  const addDividend = async () => {
    if (!dividendSymbol || !dividendAmount || isSubmittingDiv) return
    const amount = parseFloat(dividendAmount)
    if (isNaN(amount) || amount <= 0) return

    setIsSubmittingDiv(true)
    try {
      await api.recordDividend({
        account_id: currentAccount?.id ?? 1,
        symbol: dividendSymbol,
        amount: amount,
      })
      setDividendSymbol(null)
      setDividendAmount('')
      // Invalidate affected queries instead of full page reload
      await qc.invalidateQueries({ queryKey: ['overview'] })
      await qc.invalidateQueries({ queryKey: ['cash'] })
    } catch (e) {
      alert('Failed to record dividend')
    } finally {
      setIsSubmittingDiv(false)
    }
  }

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

  // Earnings breakdown by asset class (Stocks vs Funds)
  const earningsPie = useMemo(() => {
    const ea = ov?.earnings_allocation ?? {}
    const labels = Object.keys(ea)
    const values = Object.values(ea) as number[]
    if (!labels.length) return null
    const colors = ['#38bdf8', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4']
    const bg = colors.slice(0, labels.length)
    const border = ['#0ea5e9', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0891b2'].slice(0, labels.length)
    return { labels, values, bg, border }
  }, [ov?.earnings_allocation])

  const earningsChart = useMemo(() => {
    if (!ov?.chart) return null
    const labels = ov.chart.labels
    // total_pnl includes unrealized, total_return_value is realized only
    const values = (method === 'liquidation' && ov.chart.total_pnl) ? ov.chart.total_pnl : ov.chart.total_return_value
    
    if (pnlPeriod === 'ALL' || !labels.length) return { labels, values }
    
    let indices: number[] = []
    if (pnlPeriod === 'CUSTOM' && customStart && customEnd) {
      indices = labels.map((l, i) => (l >= customStart && l <= customEnd ? i : -1)).filter(i => i !== -1)
    } else {
      const now = new Date()
      let start = new Date()
      if (pnlPeriod === '1M') start.setMonth(now.getMonth() - 1)
      else if (pnlPeriod === '6M') start.setMonth(now.getMonth() - 6)
      else if (pnlPeriod === '1Y') start.setFullYear(now.getFullYear() - 1)
      else if (pnlPeriod === 'YTD') start = new Date(now.getFullYear(), 0, 1)
      
      indices = labels.map((l, i) => (new Date(l) >= start ? i : -1)).filter(i => i !== -1)
    }
    
    return {
      labels: indices.map(i => labels[i]),
      values: indices.map(i => values[i])
    }
  }, [ov?.chart, pnlPeriod, method, customStart, customEnd])

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Portfolio</div>
          <div className="pageSubtitle">Cash plus the cost of what you own (from trades and fund positions)</div>
        </div>
        <div className="detailsActions">
          <OverviewSyncBar />
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
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

      <div className="grid panels">
        {/* Portfolio Mix Pie */}
        <div className="card panel">
          <div className="panelTitle">Portfolio mix (pie)</div>
          <div className="muted mt4" style={{ fontSize: 13 }}>
            Current allocation: cash + holdings at cost (or market value).
          </div>
          {portfolioPie.total <= 0 ? (
            <div className="muted mt16">No cash or positions yet.</div>
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
                      legend: { position: 'right', labels: { boxWidth: 12 } },
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
              <div className="muted mt12 textCenter" style={{ fontSize: 13 }}>
                Pie total: <span className="mono">{formatCurrency(portfolioPie.total)}</span>
              </div>
            </>
          )}
        </div>

        {/* Earnings by Asset Class (Stocks vs Funds) — Doughnut */}
        <div className="card panel">
          <div className="panelTitle">Earnings by Asset Class</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Realized P/L split across Stocks and Funds{method === 'liquidation' ? ' (inc. unrealized)' : ''}.
          </div>
          {!earningsPie ? (
            <div className="muted" style={{ marginTop: 16 }}>No closed trades yet — earnings will appear here.</div>
          ) : (
            <>
              <div style={{ position: 'relative', height: 240, marginTop: 16 }}>
                <Doughnut
                  data={{
                    labels: earningsPie.labels,
                    datasets: [{
                      data: earningsPie.values,
                      backgroundColor: earningsPie.bg,
                      borderColor: earningsPie.border,
                      borderWidth: 2,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: {
                      legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 16, usePointStyle: true } },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const v = Number(ctx.raw ?? 0)
                            const sign = v >= 0 ? '+' : ''
                            return `${ctx.label}: ${sign}${formatCurrency(v)}`
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {earningsPie.labels.map((lbl, i) => {
                  const val = earningsPie.values[i]
                  return (
                    <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: earningsPie.bg[i] }} />
                        <span>{lbl}</span>
                      </span>
                      <span className={`mono ${val >= 0 ? 'good' : 'bad'}`}>{val >= 0 ? '+' : ''}{formatCurrency(val)}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Portfolio Earnings — Cumulative Line Chart */}
        <div className="card panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panelHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="panelTitle">Portfolio Earnings (Cumulative)</div>
            <div className="periodSelect" style={{ display: 'flex', alignItems: 'center' }}>
              {['1M', '6M', '1Y', 'YTD', 'ALL', 'CUSTOM'].map(p => (
                <button
                  key={p}
                  className={`btn-small ${pnlPeriod === p ? 'active' : ''}`}
                  onClick={() => setPnlPeriod(p)}
                  style={{ marginLeft: 4, padding: '2px 8px', fontSize: 11 }}
                >
                  {p}
                </button>
              ))}
              {pnlPeriod === 'CUSTOM' && (
                <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                  <input type="date" className="miniInput" style={{ padding: '2px 4px', fontSize: 11 }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
                  <input type="date" className="miniInput" style={{ padding: '2px 4px', fontSize: 11 }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                </div>
              )}
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
                      grid: { color: '#d9e2ec' },
                      ticks: { color: '#627d98', font: { size: 10 } }
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
                <th>Avg buying price</th>
                <th>Open cost basis</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {openHoldings.map((h: HoldingRow) => (
                <tr key={h.symbol}>
                  <td className="mono">{h.symbol}</td>
                  <td className="mono">{h.open_quantity}</td>
                  <td className="mono">{h.avg_open_cost == null ? '—' : h.avg_open_cost.toFixed(4)}</td>
                  <td className="mono">{formatCurrency(h.open_cost_basis)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {dividendSymbol === h.symbol ? (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <input
                          className="miniInput"
                          style={{ width: 80 }}
                          type="number"
                          placeholder="Amount"
                          value={dividendAmount}
                          onChange={(e) => setDividendAmount(e.target.value)}
                          autoFocus
                        />
                        <button className="btn btnGhost" onClick={addDividend} disabled={isSubmittingDiv}>
                          {isSubmittingDiv ? '...' : 'Add'}
                        </button>
                        <button className="btn btnGhost" onClick={() => setDividendSymbol(null)}>×</button>
                      </div>
                    ) : (
                      <button className="btn btnGhost" onClick={() => {
                        setDividendSymbol(h.symbol)
                        setDividendAmount('')
                      }}>
                        + Dividend
                      </button>
                    )}
                  </td>
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
