import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, Line } from 'react-chartjs-2'
import { KpiCard } from '../components/KpiCard'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { api, type OverviewResponse } from '../lib/api'
import { formatCurrency, formatPct } from '../lib/format'

function safeDiv(a: number, b: number) {
  if (b === 0) return 0
  return a / b
}

type ChartRange = '1m' | '6m' | '1y' | '2y' | 'all'

function filterSeriesByRange(
  labels: string[],
  portfolioValue: number[],
  netDeposited: number[],
  totalReturn: number[],
  range: ChartRange,
) {
  if (!labels.length || range === 'all') {
    return { labels, portfolio_value: portfolioValue, net_deposited: netDeposited, total_return_value: totalReturn }
  }
  const last = labels[labels.length - 1]
  const end = new Date(last + 'T12:00:00')
  const start = new Date(end)
  const days = range === '1m' ? 30 : range === '6m' ? 183 : range === '1y' ? 365 : 730
  start.setDate(start.getDate() - days)
  const startStr = start.toISOString().slice(0, 10)
  let i = 0
  while (i < labels.length && labels[i] < startStr) i += 1
  return {
    labels: labels.slice(i),
    portfolio_value: portfolioValue.slice(i),
    net_deposited: netDeposited.slice(i),
    total_return_value: totalReturn.slice(i),
  }
}

export function DashboardPage() {
  const qc = useQueryClient()
  const [chartRange, setChartRange] = useState<ChartRange>('6m')
  const [cashAmount, setCashAmount] = useState(1000)
  const [cashNote, setCashNote] = useState('')
  const [cashDate, setCashDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [depositMsg, setDepositMsg] = useState<string | null>(null)
  const { data: ov, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ['overview'],
    queryFn: () => api.overview(),
  })

  const depositMutation = useMutation({
    mutationFn: (payload: { amount: number; at?: string; note?: string }) => api.cashDeposit(payload),
    onSuccess: async (data: any) => {
      await qc.invalidateQueries({ queryKey: ['overview'] })
      setCashNote('')
      const bal = (data as any)?.balance
      const txid = (data as any)?.tx_id
      if (bal != null && txid != null) {
        setDepositMsg(`Deposit successful (Available: ${formatCurrency(Number(bal))}, tx: ${txid})`)
      } else if (bal != null) {
        setDepositMsg(`Deposit successful (Available: ${formatCurrency(Number(bal))})`)
      } else {
        setDepositMsg('Deposit successful')
      }
      setTimeout(() => setDepositMsg(null), 5000)
    },
    onError: (err: any) => {
      const m = err?.message ?? 'Deposit failed'
      setDepositMsg(`Deposit failed: ${m}`)
      setTimeout(() => setDepositMsg(null), 5000)
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: (payload: { amount: number; note?: string }) => api.cashWithdraw(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['overview'] })
      setCashNote('')
    },
  })

  const cashAvailable = Number(ov?.kpis.cash_balance ?? 0)
  const canWithdraw = cashAmount > 0 && cashAmount <= cashAvailable

  const realizedPnl = useMemo(() => {
    const trades = ov?.trades ?? []
    const closed = trades.filter((t) => t.exit_price != null && t.pnl != null)
    return closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  }, [ov?.trades])

  const netDeposited = Number(ov?.kpis.net_deposited ?? 0)
  const investedCapital = Number(ov?.kpis.assets_market_value ?? 0)
  const portfolioValue = Number(ov?.kpis.portfolio_value ?? 0)
  const unrealizedPnl = portfolioValue - cashAvailable - investedCapital
  const totalPnl = realizedPnl + unrealizedPnl
  const realizedReturnPct = netDeposited === 0 ? null : (realizedPnl / netDeposited) * 100
  const totalReturnPct = netDeposited === 0 ? null : (totalPnl / netDeposited) * 100
  const balanceLeft = cashAvailable + investedCapital
  const balanceRight = netDeposited + realizedPnl
  const balanceMismatch = Math.abs(balanceLeft - balanceRight) > 0.01

  const portfolioValueExpected = cashAvailable + investedCapital + unrealizedPnl
  const portfolioValueMismatch = Math.abs(portfolioValue - portfolioValueExpected) > 0.01
  const totalPnlExpected = realizedPnl + unrealizedPnl
  const totalPnlMismatch = Math.abs(totalPnl - totalPnlExpected) > 0.01
  const totalReturnExpected = netDeposited === 0 ? null : (totalPnlExpected / netDeposited) * 100
  const totalReturnMismatch =
    totalReturnExpected == null || totalReturnPct == null
      ? false
      : Math.abs(totalReturnPct - totalReturnExpected) > 1e-6

  function toneForValue(value: number | null | undefined) {
    if (value == null) return undefined
    if (value > 0) return 'good'
    if (value < 0) return 'bad'
    return 'neutral'
  }

  const computed = useMemo(() => {
    const trades = ov?.trades ?? []
    const closed = trades.filter((t) => t.exit_price != null && t.pnl != null)
    const closedSorted = closed
      .slice()
      .sort((a, b) => new Date(a.exit_date ?? a.entry_date).getTime() - new Date(b.exit_date ?? b.entry_date).getTime())

    const pnls = closedSorted.map((t) => t.pnl ?? 0)
    const total = pnls.reduce((a, b) => a + b, 0)
    const wins = closed.filter((t) => (t.pnl ?? 0) > 0)
    const losses = closed.filter((t) => (t.pnl ?? 0) < 0)
    const winRate = safeDiv(wins.length, Math.max(1, closed.length)) * 100

    const grossWin = wins.reduce((s, t) => s + (t.pnl ?? 0), 0)
    const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0)
    const profitFactor = grossLoss === 0 ? (wins.length ? Infinity : 0) : grossWin / grossLoss

    const monthlyMap = new Map<string, number>()
    for (const t of closedSorted) {
      const dt = new Date(t.exit_date ?? t.entry_date)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + (t.pnl ?? 0))
    }
    const monthlyLabels = Array.from(monthlyMap.keys()).sort()
    const monthlyValues = monthlyLabels.map((k) => monthlyMap.get(k) ?? 0)

    return {
      total,
      totalTrades: trades.length,
      closedTrades: closed.length,
      winRate,
      profitFactor,
      monthlyLabels,
      monthlyValues,
    }
  }, [ov])

  const chartFiltered = useMemo(() => {
    const labels = ov?.chart.labels ?? []
    const pvRaw = ov?.chart.portfolio_value ?? []
    const nd = ov?.chart.net_deposited ?? []
    const tr = ov?.chart.total_return_value ?? []
    return filterSeriesByRange(labels, pvRaw, nd, tr, chartRange)
  }, [ov?.chart, chartRange])

  const chartDataValues = [...chartFiltered.portfolio_value, ...chartFiltered.net_deposited, ...chartFiltered.total_return_value]
  const chartMinValue = chartDataValues.length ? Math.min(...chartDataValues) : 0
  const chartYAxisMin = chartDataValues.length ? (chartMinValue < 0 ? chartMinValue * 1.1 : chartMinValue * 0.9) : undefined
  const depositedSeries = chartFiltered.labels.map(() => netDeposited)

  const rangeButtons: { id: ChartRange; label: string }[] = [
    { id: '1m', label: '1 month' },
    { id: '6m', label: '6 months' },
    { id: '1y', label: '1 year' },
    { id: '2y', label: '2 years' },
    { id: 'all', label: 'All' },
  ]

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Dashboard</div>
          <div className="pageSubtitle">EGX (stocks) • Summary of all portfolio and trade performance</div>
        </div>
        <div className="detailsActions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="statusPill">
            API: <span className="mono">127.0.0.1:8001</span>
          </div>
          <OverviewSyncBar />
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load dashboard summary. Start the API server.</div> : null}

      <div className="grid kpis">
        <KpiCard
          label="Portfolio value"
          value={formatCurrency(portfolioValue)}
          sub="Free Cash + Market Value of Open Positions"
        />
        <KpiCard
          label="Total Return %"
          value={totalReturnPct == null ? '—' : formatPct(totalReturnPct)}
          tone={toneForValue(totalReturnPct)}
          sub="Portfolio − Net deposited"
        />
        <KpiCard
          label="Realized Return %"
          value={realizedReturnPct == null ? '—' : formatPct(realizedReturnPct)}
          tone={toneForValue(realizedReturnPct)}
          sub="Realized P/L / Net deposited"
        />
        <KpiCard label="Net deposited" value={formatCurrency(netDeposited)} sub="Deposits − withdrawals" />
      </div>
      <div className="grid kpis" style={{ marginTop: 8 }}>
        <KpiCard label="Free cash" value={formatCurrency(cashAvailable)} sub="Available for trading" />
        <KpiCard
          label="Unrealized P/L"
          value={formatCurrency(unrealizedPnl)}
          tone={toneForValue(unrealizedPnl)}
          sub="Portfolio Value − Cash − Cost Basis"
        />
        <KpiCard label="Invested capital" value={formatCurrency(investedCapital)} sub="Open positions cost basis" />
        <KpiCard label="Balance check" value={balanceMismatch ? 'Mismatch' : 'Balanced'} tone={balanceMismatch ? 'bad' : 'good'} sub={`Cash + Cost vs Deposited + Realized`} />
      </div>


      <div className="card panel" style={{ marginTop: 12 }}>
        <div className="panelTitleRow">
          <div>
            <div className="panelTitle">Cash actions</div>
            <div className="muted">
              Available free cash: <span className="mono">{formatCurrency(cashAvailable)}</span>
            </div>
          </div>
          <div className="detailsActions">
            <button
              type="button"
              className="btn btnGhost"
              onClick={() => {
                setCashAmount(1000)
                setCashDate(new Date().toISOString().slice(0, 10))
                setCashNote('')
              }}
            >
              Reset
            </button>
          </div>
        </div>
        <div className="formGrid">
          <label>
            <div className="label">Amount</div>
            <input type="number" value={cashAmount} onChange={(e) => setCashAmount(Number(e.target.value))} />
          </label>
          <label>
            <div className="label">Deposit date</div>
            <input
              type="date"
              value={cashDate}
              onChange={(e) => setCashDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label className="span2">
            <div className="label">Note (optional)</div>
            <input value={cashNote} onChange={(e) => setCashNote(e.target.value)} />
          </label>
          <div className="muted span2" style={{ marginTop: 4 }}>
            Edit the deposit amount, date, or note before submitting. Deposits are applied to your free cash balance.
          </div>
          <div className="detailsActions">
            <button
              type="button"
              className="btn"
              disabled={depositMutation.isPending || !(cashAmount > 0)}
              onClick={() =>
                depositMutation.mutate({
                  amount: cashAmount,
                  at: cashDate ? new Date(`${cashDate}T00:00:00`).toISOString() : undefined,
                  note: cashNote.trim() || undefined,
                })
              }
            >
              Deposit
            </button>
            <button
              type="button"
              className="btn btnGhost"
              disabled={withdrawMutation.isPending || !canWithdraw}
              onClick={() => withdrawMutation.mutate({ amount: cashAmount, note: cashNote.trim() || undefined })}
            >
              Withdraw
            </button>
          </div>
          {depositMsg ? (
            <div className={depositMsg.toLowerCase().includes('failed') ? 'error' : 'good'} style={{ marginTop: 8 }}>
              {depositMsg}
            </div>
          ) : null}
          {!canWithdraw && cashAmount > 0 ? (
            <div className="error">Insufficient cash (Available: {formatCurrency(cashAvailable)})</div>
          ) : null}
        </div>
      </div>

      <div className="sectionTitle">Performance History</div>
      <div className="grid panels">
        <div className="card panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panelTitleRow">
            <div>
              <div className="panelTitle">Portfolio Equity vs Net Deposited vs Total PnL</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Portfolio value = Free Cash + Total Market Value of Open Positions. Total PnL = Realized + Unrealized.
              </div>
            </div>
            <div className="detailsActions" style={{ flexWrap: 'wrap' }}>
              {rangeButtons.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={chartRange === b.id ? 'btn' : 'btn btnGhost'}
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  onClick={() => setChartRange(b.id)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          {chartFiltered.labels.length === 0 ? (
            <div className="muted">No history yet.</div>
          ) : (
              <Line
              data={{
                labels: chartFiltered.labels,
                datasets: [
                  {
                    label: 'Portfolio Value',
                    data: chartFiltered.portfolio_value,
                    borderColor: 'rgba(34,197,94,0.9)',
                    backgroundColor: 'rgba(34,197,94,0.12)',
                    fill: false,
                    pointRadius: 1.5,
                    tension: 0.25,
                  },
                  {
                    label: 'Net Deposited',
                    data: chartFiltered.net_deposited,
                    borderColor: 'rgba(148,163,184,0.8)',
                    fill: false,
                    pointRadius: 1.5,
                    tension: 0.2,
                  },
                  {
                    label: 'Total PnL',
                    data: chartFiltered.total_return_value,
                    borderColor: 'rgba(124,58,237,0.9)',
                    fill: false,
                    pointRadius: 1.5,
                    tension: 0.2,
                  },
                  {
                    label: 'Deposited',
                    data: depositedSeries,
                    borderColor: 'rgba(203,213,225,0.85)',
                    borderDash: [10, 6],
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                  legend: { position: 'bottom', labels: { color: 'rgba(148,163,184,0.95)' } },
                  tooltip: { intersect: false, mode: 'index' },
                },
                scales: {
                  x: { ticks: { maxTicksLimit: 10, color: 'rgba(148,163,184,0.9)' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                  y: {
                    min: chartYAxisMin,
                    ticks: { color: 'rgba(148,163,184,0.9)' },
                    grid: { color: 'rgba(148,163,184,0.08)' },
                  },
                },
              }}
              height={360}
            />
          )}
        </div>
      </div>

      <div className="sectionTitle">Trade Summary</div>
      <div className="grid kpis">
        <KpiCard
          label="Realized P/L"
          value={formatCurrency(realizedPnl)}
          tone={toneForValue(realizedPnl)}
          sub="Closed trades only"
        />
        <KpiCard
          label="Unrealized P/L (open positions)"
          value={formatCurrency(unrealizedPnl)}
          tone={toneForValue(unrealizedPnl)}
          sub="Portfolio Value − Cash − Cost Basis"
        />
        <KpiCard
          label="Total P/L"
          value={formatCurrency(totalPnl)}
          tone={totalPnlMismatch ? 'bad' : toneForValue(totalPnl)}
          tooltip={totalPnlMismatch ? `Actual: ${formatCurrency(totalPnl)} | Expected: ${formatCurrency(totalPnlExpected)}` : undefined}
          sub="Realized + Unrealized"
        />
        <KpiCard
          label="Realized Return %"
          value={realizedReturnPct == null ? '—' : formatPct(realizedReturnPct)}
          tone={toneForValue(realizedReturnPct)}
          sub="Realized P/L / Net deposited"
        />
      </div>
      <div className="grid kpis" style={{ marginTop: 8 }}>
        <KpiCard
          label="Total Return %"
          value={totalReturnPct == null ? '—' : formatPct(totalReturnPct)}
          tone={totalReturnMismatch ? 'bad' : toneForValue(totalReturnPct)}
          tooltip={
            totalReturnMismatch
              ? `Actual: ${totalReturnPct == null ? '—' : formatPct(totalReturnPct)} | Expected: ${
                  totalReturnExpected == null ? '—' : formatPct(totalReturnExpected)
                }`
              : undefined
          }
          sub="Portfolio gain relative to deposits"
        />
        <KpiCard
          label="Invested capital"
          value={formatCurrency(investedCapital)}
          sub="Open positions cost basis"
        />
        <KpiCard label="Available cash" value={formatCurrency(cashAvailable)} sub="Free cash for trading" />
        <KpiCard
          label="Balance check"
          value={balanceMismatch ? 'Mismatch' : 'Balanced'}
          tone={balanceMismatch ? 'bad' : 'good'}
          tooltip={
            balanceMismatch
              ? `Actual: ${formatCurrency(balanceLeft)} | Expected: ${formatCurrency(balanceRight)}`
              : undefined
          }
          sub={`Cash + Cost vs Deposited + Realized`}
        />
      </div>
      {balanceMismatch ? (
        <div className="riskBanner status-warning" style={{ marginTop: 10 }}>
          <div className="riskBannerTitle">Capital balance mismatch</div>
          <div className="riskBannerBody muted">
            Free Cash + Invested Capital should equal Net Deposited + Realized P/L.
            Current: {formatCurrency(balanceLeft)} vs {formatCurrency(balanceRight)}.
          </div>
        </div>
      ) : null}

      <div className="card panel" style={{ marginTop: 10, gridColumn: '1 / -1' }}>
        <div className="panelTitle">Portfolio math reference</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div><strong>Realized P/L</strong> = sum of closed trade PnL</div>
          <div><strong>Unrealized P/L</strong> = Portfolio Value − Free Cash − Invested Capital (Cost Basis)</div>
          <div><strong>Total P/L</strong> = Realized P/L + Unrealized P/L = Portfolio Value − Net Deposited</div>
          <div><strong>Realized Return %</strong> = Realized P/L ÷ Net Deposited × 100</div>
          <div><strong>Total Return %</strong> = (Portfolio Value − Net Deposited) ÷ Net Deposited × 100</div>
          <div><strong>Balance check</strong> = Free Cash + Invested Capital = Net Deposited + Realized P/L</div>
        </div>
      </div>

      <div className="grid panels">
        <div className="card panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panelTitle">Monthly Performance</div>
          {computed.monthlyLabels.length === 0 ? (
            <div className="muted">No monthly data yet.</div>
          ) : (
            <Bar
              data={{
                labels: computed.monthlyLabels,
                datasets: [
                  {
                    label: 'PnL',
                    data: computed.monthlyValues,
                    backgroundColor: computed.monthlyValues.map((v) =>
                      v >= 0 ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)',
                    ),
                    borderColor: computed.monthlyValues.map((v) =>
                      v >= 0 ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)',
                    ),
                    borderWidth: 1,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { ticks: { maxTicksLimit: 8, color: 'rgba(148,163,184,0.9)' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                  y: { ticks: { color: 'rgba(148,163,184,0.9)' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                },
              }}
              height={220}
            />
          )}
        </div>
      </div>
    </div>
  )
}
