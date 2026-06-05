import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pie, Doughnut, Line } from 'react-chartjs-2'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { MarketStatusPill } from '../components/MarketStatusPill'
import { PriceSparkline } from '../components/PriceSparkline'
import { UnrealizedPnlCell } from '../components/UnrealizedPnlCell'
import { api } from '../lib/api'
import type { HoldingRow, PricePoint } from '../lib/api'
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

  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false)

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
      await qc.invalidateQueries({ queryKey: ['overview'] })
      await qc.invalidateQueries({ queryKey: ['cash'] })
    } catch (e) {
      alert('Failed to record dividend')
    } finally {
      setIsSubmittingDiv(false)
    }
  }

  const handleRefreshPrices = async () => {
    if (isRefreshingPrices) return
    setIsRefreshingPrices(true)
    try {
      await api.portfolioRefreshPrices(currentAccount?.id ?? 1)
      await qc.invalidateQueries({ queryKey: ['overview'] })
      await qc.invalidateQueries({ queryKey: ['price-history'] })
    } catch (e) {
      alert('Failed to refresh prices')
    } finally {
      setIsRefreshingPrices(false)
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

  const openSymbols = useMemo(
    () => Array.from(new Set(openHoldings.map((h) => h.symbol))),
    [openHoldings],
  )

  const { data: historyMap } = useQuery<Record<string, PricePoint[]>>({
    queryKey: ['price-history', currentAccount?.id, openSymbols],
    queryFn: async () => {
      if (openSymbols.length === 0) return {}
      const entries = await Promise.all(
        openSymbols.map(async (sym) => {
          try {
            const r = await api.getPriceHistory(sym, 30)
            return [sym, r.points] as const
          } catch {
            return [sym, []] as const
          }
        }),
      )
      return Object.fromEntries(entries)
    },
    enabled: openSymbols.length > 0,
    staleTime: 5 * 60_000,
  })

  const metrics = useMemo(() => {
    const cash = Number(ov?.kpis.cash_balance ?? 0)
    const netDep = Number(ov?.kpis.net_deposited ?? 0)
    const realizedPnl = Number(ov?.kpis.realized_pnl_total ?? 0)
    const assetsCost = Number(ov?.kpis.assets_market_value ?? 0)

    const pv = Number(ov?.kpis.portfolio_value ?? 0)
    const totalPnL = Number(ov?.kpis.total_return_value ?? 0)
    const returnPct = Number(ov?.kpis.total_return_pct ?? 0)

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
    const stockSymbols = new Set(openHoldings.map(h => h.symbol))
    const fundAlloc = ov?.fund_allocation ?? {}
    for (const [sym, val] of Object.entries(fundAlloc)) {
      if (stockSymbols.has(sym)) continue
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
          <MarketStatusPill />
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
        <div className="card panel">
          <div className="panelTitle">Portfolio mix (pie)</div>
          <div className="muted panelSubtitle">
            Current allocation: cash + holdings at cost (or market value).
          </div>
          {portfolioPie.total <= 0 ? (
            <div className="muted mt16">No cash or positions yet.</div>
          ) : (
            <>
              <div className="chartWrapper chartWrapperCentered">
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
              <div className="muted mt12 textCenter panelSubtitle">
                Pie total: <span className="mono">{formatCurrency(portfolioPie.total)}</span>
              </div>
            </>
          )}
        </div>

        <div className="card panel">
          <div className="panelTitle">Earnings by Asset Class</div>
          <div className="muted panelSubtitle">
            Realized P/L split across Stocks and Funds{method === 'liquidation' ? ' (inc. unrealized)' : ''}.
          </div>
          {!earningsPie ? (
            <div className="muted mt16">No closed trades yet — earnings will appear here.</div>
          ) : (
            <>
              <div className="chartDoughnut">
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
              <div className="earningsLegend">
                {earningsPie.labels.map((lbl, i) => {
                  const val = earningsPie.values[i]
                  return (
                    <div key={lbl} className="earningsLegendRow">
                      <span className="earningsLegendLabel">
                        <span className="earningsLegendDot" style={{ background: earningsPie.bg[i] }} />
                        <span>{lbl}</span>
                      </span>
                      <span className={`mono ${val >= 0 ? 'good' : 'bad'}`}>
                        {val >= 0 ? '+' : ''}{formatCurrency(val)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="card panel fullPanel">
          <div className="panelHeader">
            <div className="panelTitle">Portfolio Earnings (Cumulative)</div>
            <div className="periodSelector">
              {['1M', '6M', '1Y', 'YTD', 'ALL', 'CUSTOM'].map(p => (
                <button
                  key={p}
                  className={`btn-small periodBtn ${pnlPeriod === p ? 'active' : ''}`}
                  onClick={() => setPnlPeriod(p)}
                >
                  {p}
                </button>
              ))}
              {pnlPeriod === 'CUSTOM' && (
                <div className="periodDateRow">
                  <input type="date" className="miniInput periodDateInput" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                  <input type="date" className="miniInput periodDateInput" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                </div>
              )}
            </div>
          </div>
          <div className="muted panelSubtitle">
            Cumulative {method === 'realized' ? 'Realized PnL' : 'Total PnL (inc. unrealized)'} over time.
          </div>
          {!earningsChart || !earningsChart.labels.length ? (
            <div className="muted mt16">No earnings data for this period.</div>
          ) : (
            <div className="chartWrapper chartWrapperWide">
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
        <div className="error mismatchError">
          Pie total {formatCurrency(metrics.realizedFromLedger)} ≠ realized portfolio value {formatCurrency(metrics.realizedFromPnL)}. Check fund positions.
        </div>
      ) : null}

      <div className="card panel mt12">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Positions by symbol</div>
            <div className="muted mt8">
              Reference price per row is your <strong>average open cost</strong> (buying price from trades). Current price is auto-fetched for EGX symbols.
            </div>
          </div>
          <div className="detailsActions">
            <button
              className="btn btnGhost"
              onClick={handleRefreshPrices}
              disabled={isRefreshingPrices || openSymbols.length === 0}
              title="Refresh EGX prices now"
            >
              {isRefreshingPrices ? 'Refreshing…' : '↻ Refresh prices'}
            </button>
          </div>
        </div>
        <div className="tableWrap positionsTable">
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Open Qty</th>
                <th>Avg buying price</th>
                <th>Current price</th>
                <th>Trend (30d)</th>
                <th>Open cost basis</th>
                <th>Market value</th>
                <th>Unrealized P/L</th>
                <th className="textRight">Actions</th>
              </tr>
            </thead>
            <tbody>
              {openHoldings.map((h: HoldingRow) => {
                const hist = historyMap?.[h.symbol] ?? []
                const closes = hist.map((p) => p.close)
                const isUp = closes.length >= 2 ? closes[closes.length - 1] >= closes[0] : (h.unrealized_pnl ?? 0) >= 0
                return (
                  <tr key={h.symbol}>
                    <td className="mono">{h.symbol}</td>
                    <td className="mono">{h.open_quantity}</td>
                    <td className="mono">{h.avg_open_cost == null ? '—' : h.avg_open_cost.toFixed(4)}</td>
                    <td className="mono">
                      {h.current_price != null ? h.current_price.toFixed(2) : '—'}
                    </td>
                    <td>
                      {closes.length >= 2 ? <PriceSparkline values={closes} positive={isUp} /> : <span className="muted">—</span>}
                    </td>
                    <td className="mono">{formatCurrency(h.open_cost_basis)}</td>
                    <td className="mono">
                      {h.market_value != null ? formatCurrency(h.market_value) : '—'}
                    </td>
                    <td>
                      <UnrealizedPnlCell pnl={h.unrealized_pnl} pct={h.unrealized_pnl_pct} />
                    </td>
                    <td className="textRight">
                      {dividendSymbol === h.symbol ? (
                        <div className="dividendInputRow">
                          <input
                            className="miniInput dividendInput"
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
                )
              })}
              {openHoldings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted">
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
