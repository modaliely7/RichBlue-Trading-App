import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Trade } from '../lib/api'
import { formatCurrency, formatPct } from '../lib/format'
import { useAccount } from '../components/AccountContext'

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function RiskPage() {
  const { currentAccount } = useAccount()
  const { data, isLoading, error } = useQuery({ 
    queryKey: ['trades', currentAccount?.id], 
    queryFn: () => api.listTrades(currentAccount?.id ?? 1) 
  })

  const [account, setAccount] = useState(10_000)
  const [riskPct, setRiskPct] = useState(1)
  const [entry, setEntry] = useState(100)
  const [stop, setStop] = useState(98)

  const [dailyLossLimit, setDailyLossLimit] = useState(200)
  const [maxDdLimit, setMaxDdLimit] = useState(1_000)

  const calc = useMemo(() => {
    const riskAmount = (account * clamp(riskPct, 0, 100)) / 100
    const perUnitRisk = Math.abs(entry - stop)
    const positionSize = perUnitRisk > 0 ? riskAmount / perUnitRisk : 0
    const notional = positionSize * entry
    return { riskAmount, perUnitRisk, positionSize, notional }
  }, [account, riskPct, entry, stop])

  const monitors = useMemo(() => {
    const trades = (data as Trade[]) ?? []
    const closed = trades
      .filter((t: Trade) => t.exit_price != null && t.pnl != null)
      .slice()
      .sort(
        (a: Trade, b: Trade) =>
          new Date(a.exit_date ?? a.entry_date).getTime() -
          new Date(b.exit_date ?? b.entry_date).getTime(),
      )

    // Daily PnL (today)
    const todayKey = dayKeyLocal(new Date())
    let todayPnl = 0
    for (const t of closed) {
      const dt = new Date(t.exit_date ?? t.entry_date)
      if (dayKeyLocal(dt) === todayKey) todayPnl += t.pnl ?? 0
    }

    // Equity + drawdown
    let equity = 0
    let peak = 0
    let currentDd = 0
    let maxDd = 0
    for (const t of closed) {
      equity += t.pnl ?? 0
      peak = Math.max(peak, equity)
      currentDd = equity - peak
      maxDd = Math.min(maxDd, currentDd)
    }

    return {
      todayKey,
      todayPnl,
      currentDd,
      maxDd,
      closedCount: closed.length,
    }
  }, [data])

  const dailyStatus =
    monitors.todayPnl <= -Math.abs(dailyLossLimit)
      ? 'BREACHED'
      : monitors.todayPnl <= -Math.abs(dailyLossLimit) * 0.7
        ? 'WARNING'
        : 'OK'

  const ddStatus =
    monitors.maxDd <= -Math.abs(maxDdLimit)
      ? 'BREACHED'
      : monitors.maxDd <= -Math.abs(maxDdLimit) * 0.7
        ? 'WARNING'
        : 'OK'

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Risk Management</div>
          <div className="pageSubtitle">Position sizing, daily loss limit, and drawdown monitoring</div>
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load trades. Start the API server.</div> : null}

      <div className="grid panels">
        <div className="card panel">
          <div className="panelTitle">Position Size Calculator</div>
          <div className="formGrid">
            <label>
              <div className="label">Account Size</div>
              <input type="number" value={account} onChange={(e) => setAccount(Number(e.target.value))} />
            </label>
            <label>
              <div className="label">Risk % per Trade</div>
              <input type="number" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
            </label>
            <label>
              <div className="label">Entry Price</div>
              <input type="number" value={entry} onChange={(e) => setEntry(Number(e.target.value))} />
            </label>
            <label>
              <div className="label">Stop Loss</div>
              <input type="number" value={stop} onChange={(e) => setStop(Number(e.target.value))} />
            </label>
          </div>

          <div className="riskResults">
            <div className="riskRow">
              <span className="muted">Risk Amount:</span> <span className="mono">{formatCurrency(calc.riskAmount)}</span>
              <span className="muted" style={{ marginLeft: 10 }}>
                Per-unit risk:
              </span>{' '}
              <span className="mono">{calc.perUnitRisk.toFixed(4)}</span>
            </div>
            <div className="riskRow">
              <span className="muted">Position Size:</span>{' '}
              <span className="mono">{calc.positionSize ? calc.positionSize.toFixed(4) : '—'}</span>
              <span className="muted" style={{ marginLeft: 10 }}>
                Notional:
              </span>{' '}
              <span className="mono">{formatCurrency(calc.notional)}</span>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Tip: for stocks, position size is usually “shares”. For crypto/forex, it can be “units”.
            </div>
          </div>
        </div>

        <div className="card panel">
          <div className="panelTitle">Daily Loss Limit Monitor</div>
          <div className="formGrid">
            <label className="span2">
              <div className="label">Daily Loss Limit (absolute)</div>
              <input
                type="number"
                value={dailyLossLimit}
                onChange={(e) => setDailyLossLimit(Number(e.target.value))}
              />
            </label>
          </div>

          <div className={`riskBanner status-${dailyStatus.toLowerCase()}`}>
            <div className="riskBannerTitle">
              Status: <span className="mono">{dailyStatus}</span>
            </div>
            <div className="riskBannerBody">
              Today ({monitors.todayKey}) PnL:{' '}
              <span className={monitors.todayPnl >= 0 ? 'good' : 'bad'}>{formatCurrency(monitors.todayPnl)}</span>
              <span className="muted" style={{ marginLeft: 10 }}>
                Limit:
              </span>{' '}
              <span className="mono">{formatCurrency(-Math.abs(dailyLossLimit))}</span>
            </div>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Based on closed trades for today only.
          </div>
        </div>

        <div className="card panel">
          <div className="panelTitle">Max Drawdown Monitor</div>
          <div className="formGrid">
            <label className="span2">
              <div className="label">Max Drawdown Limit (absolute)</div>
              <input type="number" value={maxDdLimit} onChange={(e) => setMaxDdLimit(Number(e.target.value))} />
            </label>
          </div>

          <div className={`riskBanner status-${ddStatus.toLowerCase()}`}>
            <div className="riskBannerTitle">
              Status: <span className="mono">{ddStatus}</span>
            </div>
            <div className="riskBannerBody">
              Max DD:{' '}
              <span className={monitors.maxDd >= 0 ? 'good' : 'bad'}>{formatCurrency(monitors.maxDd)}</span>
              <span className="muted" style={{ marginLeft: 10 }}>
                Limit:
              </span>{' '}
              <span className="mono">{formatCurrency(-Math.abs(maxDdLimit))}</span>
              <span className="muted" style={{ marginLeft: 10 }}>
                Closed trades:
              </span>{' '}
              <span className="mono">{monitors.closedCount}</span>
            </div>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Drawdown computed from equity curve of closed trades.
          </div>
        </div>

        <div className="card panel">
          <div className="panelTitle">Quick Rules (suggested)</div>
          <div className="muted">
            - Daily loss limit: 1–3R (your average risk-per-trade)
            <br />- Max drawdown: stop trading + review playbook
            <br />- Keep risk-per-trade consistent (e.g. {formatPct(riskPct)})
          </div>
        </div>
      </div>
    </div>
  )
}

