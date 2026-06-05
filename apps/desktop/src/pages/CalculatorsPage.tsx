import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useAccount } from '../components/AccountContext'
import { PageHeader, Button, Modal } from '../components/ui'

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export function CalculatorsPage() {
  const { currentAccount } = useAccount()

  const { data: ov } = useQuery({
    queryKey: ['overview', currentAccount?.id],
    queryFn: () => api.overview(currentAccount?.id ?? 1)
  })

  const [account, setAccount] = useState(10_000)
  const [riskPct, setRiskPct] = useState(1)
  const [entry, setEntry] = useState(100)
  const [stop, setStop] = useState(98)
  const [target, setTarget] = useState(105)

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
      <PageHeader
        title="Trading Calculators"
        subtitle="Plan your risk, simulate scenarios, and monitor allocations."
        actions={
          <Button leftIcon={<Plus size={16} />} onClick={() => setIsSimulating(true)}>
            Simulate Trade
          </Button>
        }
      />

      <div className="calcLayout">
        <div className="mainCol">
          <div className="calcPanelsGrid">
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

              <div className="calcResults">
                <div className="calcResultRow">
                  <span className="muted">Position Size:</span>
                  <span className="calcMetricValue success strong">
                    {Number.isFinite(calc.positionSize) ? calc.positionSize.toFixed(2) : '—'} units
                  </span>
                </div>
                <div className="calcMetrics">
                  <div className="calcMetric">
                    <span className="calcMetricLabel">Risk Amount</span>
                    <span className="calcMetricValue">{formatCurrency(calc.riskAmount)}</span>
                  </div>
                  <div className="calcMetric">
                    <span className="calcMetricLabel">Potential Reward</span>
                    <span className="calcMetricValue success">
                      {Number.isFinite(calc.positionSize) ? formatCurrency(calc.reward * calc.positionSize) : '—'}
                    </span>
                  </div>
                  <div className="calcMetric">
                    <span className="calcMetricLabel">Risk/Reward Ratio</span>
                    <span className="calcMetricValue accent">
                      {Number.isFinite(calc.rr) ? calc.rr.toFixed(2) : '—'}R
                    </span>
                  </div>
                  <div className="calcMetric">
                    <span className="calcMetricLabel">Notional Value</span>
                    <span className="calcMetricValue">{formatCurrency(calc.notional)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card panel">
              <div className="panelTitle">Portfolio Allocation</div>
              <div className="allocationHero">
                <div className="allocationHeroValue">{allocationPct.toFixed(1)}%</div>
                <div className="allocationHeroLabel">of portfolio currently allocated</div>
              </div>

              <div className="tableWrap allocationTable">
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
                        }}>
                          <td className="mono">{h.symbol}</td>
                          <td className="mono">{h.open_quantity}</td>
                          <td className="mono">{formatCurrency(val)}</td>
                          <td className="mono accent">{pct.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                    {openHoldings.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">No open positions.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="muted calcTip">Tip: Click a position to load its price into the calculator.</div>
            </div>

            <div className="card panel fullRow">
              <div className="panelTitle">Advanced Strategy Tools</div>
              <div className="calcPanelGrid">
                <div className="advancedToolBlock">
                  <div className="label">Kelly Criterion</div>
                  <div className="muted">Suggests optimal risk % based on win rate and RR.</div>
                  <div className="card panel">
                    <div className="calcResultRow">
                      <span className="muted">Optimal Risk:</span>
                      <span className="calcMetricValue success strong">2.45%</span>
                    </div>
                    <div className="muted mutedTiny">Based on 55% Win Rate & 2.0 RR</div>
                  </div>
                </div>
                <div className="advancedToolBlock">
                  <div className="label">Risk of Ruin</div>
                  <div className="muted">Probability of losing entire capital.</div>
                  <div className="card panel">
                    <div className="calcResultRow">
                      <span className="muted">Probability:</span>
                      <span className="calcMetricValue danger strong">0.02%</span>
                    </div>
                    <div className="muted mutedTiny">Based on current win rate & sizing</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sideCol">
          <div className="sectionTitle">Recent Calculations</div>
          <div className="recentList">
            <div className="card panel">
              <div className="recentItemTitle">AAPL Breakout Plan</div>
              <div className="muted recentItemMeta">Risk: $100 | Size: 12 shares</div>
            </div>
            <div className="card panel">
              <div className="recentItemTitle">TSLA Mean Reversion</div>
              <div className="muted recentItemMeta">Risk: $200 | Size: 4 shares</div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={isSimulating}
        onClose={() => setIsSimulating(false)}
        title="Simulate Trade Scenario"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsSimulating(false)}>Cancel</Button>
            <Button onClick={() => setIsSimulating(false)}>Run Simulation</Button>
          </>
        }
      >
        <p className="muted mb16">Project outcomes without risking real capital.</p>
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
      </Modal>
    </div>
  )
}
