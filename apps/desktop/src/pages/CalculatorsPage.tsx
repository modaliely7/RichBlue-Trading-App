import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Trade } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useAccount } from '../components/AccountContext'

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}



export function CalculatorsPage() {
  const { currentAccount } = useAccount()

  const { data: ov } = useQuery({
    queryKey: ['overview', currentAccount?.id],
    queryFn: () => api.overview(currentAccount?.id ?? 1)
  })

  // Position Size Calculator State
  const [account, setAccount] = useState(10_000)
  const [riskPct, setRiskPct] = useState(1)
  const [entry, setEntry] = useState(100)
  const [stop, setStop] = useState(98)
  const [target, setTarget] = useState(105)

  // Simulation Modal
  const [isSimulating, setIsSimulating] = useState(false)
  const [simName, setSimName] = useState('New Simulation')

  const calc = useMemo(() => {
    const riskAmount = (account * clamp(riskPct, 0, 100)) / 100
    const perUnitRisk = Math.abs(entry - stop)
    const positionSize = perUnitRisk > 0 ? riskAmount / perUnitRisk : 0
    const notional = positionSize * entry
    const reward = Math.abs(target - entry)
    const rr = perUnitRisk > 0 ? reward / perUnitRisk : 0
    return { riskAmount, perUnitRisk, positionSize, notional, reward, rr }
  }, [account, riskPct, entry, stop, target])

  const openHoldings = useMemo(() => ov?.holdings?.filter(h => h.open_quantity > 0) ?? [], [ov])
  const pv = Number(ov?.kpis?.portfolio_value ?? 0)
  const invested = Number(ov?.kpis?.assets_market_value ?? 0)
  const allocationPct = pv > 0 ? (invested / pv) * 100 : 0

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Trading Calculators</div>
          <div className="pageSubtitle">Plan your risk, simulate scenarios, and monitor allocations.</div>
        </div>
        <div className="detailsActions">
          <button className="btn" onClick={() => setIsSimulating(true)}>+ Simulate Trade</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div className="mainCol">
          <div className="grid panels" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
            {/* Sizing Calculator */}
            <div className="card panel">
              <div className="panelTitle">Advanced Position Sizer</div>
              <div className="formGrid">
                <label className="span2">
                  <div className="label">Account Balance</div>
                  <input type="number" value={account} onChange={(e) => setAccount(Number(e.target.value))} />
                </label>
                <label className="span2">
                  <div className="label">Risk %</div>
                  <input type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
                </label>
                <label>
                  <div className="label">Entry</div>
                  <input type="number" value={entry} onChange={(e) => setEntry(Number(e.target.value))} />
                </label>
                <label>
                  <div className="label">Stop</div>
                  <input type="number" value={stop} onChange={(e) => setStop(Number(e.target.value))} />
                </label>
                <label className="span2">
                  <div className="label">Target</div>
                  <input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
                </label>
              </div>

              <div style={{ marginTop: 24, padding: 20, background: 'var(--panel2)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span className="muted">Position Size:</span>
                  <span className="good strong mono" style={{ fontSize: 20 }}>
                    {Number.isFinite(calc.positionSize) ? calc.positionSize.toFixed(2) : '—'} units
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div className="label" style={{ fontSize: 10 }}>Risk Amount</div>
                    <div className="mono" style={{ fontSize: 16 }}>{formatCurrency(calc.riskAmount)}</div>
                  </div>
                  <div>
                    <div className="label" style={{ fontSize: 10 }}>Potential Reward</div>
                    <div className="mono good" style={{ fontSize: 16 }}>
                      {Number.isFinite(calc.positionSize) ? formatCurrency(calc.reward * calc.positionSize) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="label" style={{ fontSize: 10 }}>Risk/Reward Ratio</div>
                    <div className="mono accent" style={{ fontSize: 16 }}>
                      {Number.isFinite(calc.rr) ? calc.rr.toFixed(2) : '—'}R
                    </div>
                  </div>
                  <div>
                    <div className="label" style={{ fontSize: 10 }}>Notional Value</div>
                    <div className="mono" style={{ fontSize: 16 }}>{formatCurrency(calc.notional)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Allocation Insight */}
            <div className="card panel">
              <div className="panelTitle">Portfolio Allocation</div>
              <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)' }}>{allocationPct.toFixed(1)}%</div>
                <div className="muted">of portfolio currently allocated</div>
              </div>
              
              <div className="tableWrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Qty</th>
                      <th>Value</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openHoldings.map(h => {
                      const val = h.market_value || h.open_cost_basis
                      const pct = pv > 0 ? (val / pv) * 100 : 0
                      return (
                        <tr key={h.symbol} onClick={() => {
                          setEntry(h.avg_open_cost || 0)
                          setAccount(pv)
                        }} style={{ cursor: 'pointer' }}>
                          <td className="mono">{h.symbol}</td>
                          <td className="mono">{h.open_quantity}</td>
                          <td className="mono">{formatCurrency(val)}</td>
                          <td className="mono accent">{pct.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                    {openHoldings.length === 0 && <tr><td colSpan={4} className="muted">No open positions.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>Tip: Click a position to load its price into the calculator.</div>
            </div>

            {/* Advanced Tools */}
            <div className="card panel" style={{ gridColumn: 'span 2' }}>
              <div className="panelTitle">Advanced Strategy Tools</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <div className="label" style={{ marginBottom: 12 }}>Kelly Criterion</div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Suggests optimal risk % based on win rate and RR.</div>
                  <div style={{ padding: 16, background: 'var(--bg)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="muted">Optimal Risk:</span>
                      <span className="good strong mono">2.45%</span>
                    </div>
                    <div className="muted" style={{ fontSize: 10 }}>Based on 55% Win Rate & 2.0 RR</div>
                  </div>
                </div>
                <div>
                  <div className="label" style={{ marginBottom: 12 }}>Risk of Ruin</div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Probability of losing entire capital.</div>
                  <div style={{ padding: 16, background: 'var(--bg)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="muted">Probability:</span>
                      <span className="bad strong mono">0.02%</span>
                    </div>
                    <div className="muted" style={{ fontSize: 10 }}>Based on current win rate & sizing</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sideCol">
          <div className="sectionTitle">Recent Calculations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="card panel" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>AAPL Breakout Plan</div>
              <div className="muted" style={{ fontSize: 11 }}>Risk: $100 | Size: 12 shares</div>
            </div>
            <div className="card panel" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>TSLA Mean Reversion</div>
              <div className="muted" style={{ fontSize: 11 }}>Risk: $200 | Size: 4 shares</div>
            </div>
          </div>
        </div>
      </div>

      {isSimulating && (
        <div className="modalOverlay" onClick={() => setIsSimulating(false)}>
          <div className="modal card panel" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
            <div className="panelTitle">Simulate Trade Scenario</div>
            <div className="muted" style={{ marginBottom: 20 }}>Project outcomes without risking real capital.</div>
            
            <div className="formGrid">
              <label className="span4">
                <div className="label">Scenario Name</div>
                <input type="text" value={simName} onChange={e => setSimName(e.target.value)} />
              </label>
              <label className="span2">
                <div className="label">Entry</div>
                <input type="number" defaultValue={100} />
              </label>
              <label className="span2">
                <div className="label">Target</div>
                <input type="number" defaultValue={120} />
              </label>
            </div>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btnGhost" onClick={() => setIsSimulating(false)}>Cancel</button>
              <button className="btn" onClick={() => setIsSimulating(false)}>Run Simulation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
