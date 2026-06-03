import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

function fmtNum(v: number | string | null | undefined, d = 2) {
  if (v == null || v === 'n/a') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function StockResearchPage() {
  const [ticker, setTicker] = useState('')
  const [activeTicker, setActiveTicker] = useState('')
  const [duration, setDuration] = useState(365)

  const { data: scoreData } = useQuery({
    queryKey: ['stockScore', activeTicker],
    queryFn: () => api.stockScore(activeTicker),
    enabled: !!activeTicker,
  })

  const { data: potentialData, isLoading: potLoading } = useQuery({
    queryKey: ['potential', activeTicker, duration],
    queryFn: () => api.potential(activeTicker, duration),
    enabled: !!activeTicker,
  })

  const { data: fundData } = useQuery({
    queryKey: ['fundamentals', activeTicker],
    queryFn: () => api.fundamentals(activeTicker),
    enabled: !!activeTicker,
  })

  function analyze() {
    const t = ticker.trim().toUpperCase()
    if (!t) return
    setActiveTicker(t)
  }

  const stockScore = scoreData?.score ?? 0
  const scoreColor = stockScore >= 70 ? 'var(--accent2)' : stockScore >= 40 ? 'var(--warn)' : 'var(--danger)'

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Stock Research</div>
          <div className="pageSubtitle">Deep dive into performance, potential and history.</div>
        </div>
      </div>

      <div className="card panel" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ flex: 1 }}>
            <div className="label">Search Symbol (EGX supported e.g. EGAL, MBSC)</div>
            <input 
              value={ticker} 
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="Enter ticker..."
              onKeyDown={e => e.key === 'Enter' && analyze()}
            />
          </label>
          <button className="btn" onClick={analyze} disabled={!ticker.trim()}>
            Research Stock
          </button>
        </div>
      </div>

      {activeTicker && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Header Card */}
          <div className="card panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-strong)' }}>{activeTicker}</div>
                <div className={`pill`} style={{ background: scoreColor + '22', color: scoreColor, border: `1px solid ${scoreColor}` }}>
                   Score: {stockScore.toFixed(0)}
                </div>
              </div>
              <div className="muted" style={{ marginTop: 4 }}>{fundData?.company_name || 'Stock Analysis'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>CURRENT PRICE</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-strong)' }}>
                ${fmtNum(fundData?.current_price || potentialData?.current_price)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Potential Analysis (What-If) */}
            <div className="card panel">
              <div className="panelTitle">🚀 Potential Analysis (What-If)</div>
              <div style={{ marginBottom: 20 }}>
                <div className="label">Simulation Duration</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {[90, 180, 365, 730].map(d => (
                    <button 
                      key={d} 
                      className={`rangeBtn ${duration === d ? 'active' : ''}`}
                      onClick={() => setDuration(d)}
                    >
                      {d} Days
                    </button>
                  ))}
                </div>
              </div>

              {potLoading ? (
                <div className="muted">Running simulations...</div>
              ) : potentialData?.error ? (
                <div className="error">{potentialData.error}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="metricRow" style={{ background: 'var(--panel2)', padding: 12, borderRadius: 10 }}>
                    <div>
                      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>POINT OF CONTROL (POC)</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>${fmtNum(potentialData?.poc_price)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>ROI FROM POC</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: potentialData?.potential_roi_poc >= 0 ? 'var(--accent2)' : 'var(--danger)' }}>
                        {potentialData?.potential_roi_poc?.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="card" style={{ padding: 16, background: 'var(--panel2)' }}>
                      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>LONG TERM HOLD</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: potentialData?.long_term_roi >= 0 ? 'var(--accent2)' : 'var(--danger)' }}>
                        {potentialData?.long_term_roi?.toFixed(2)}%
                      </div>
                    </div>
                    <div className="card" style={{ padding: 16, background: 'var(--panel2)' }}>
                      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>SWING POTENTIAL</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
                        +{potentialData?.swing_potential?.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>
                    * POC (Point of Control) is the price level where the most volume was traded. 
                    Simulations suggest that entering at POC often provides the highest R/R.
                  </div>
                </div>
              )}
            </div>

            {/* Personal History & Quality */}
            <div className="card panel">
              <div className="panelTitle">📈 Your History with {activeTicker}</div>
              {scoreData?.personal_trade_count > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div className="muted" style={{ fontSize: 10, fontWeight: 700 }}>TRADES</div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{scoreData.personal_trade_count}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div className="muted" style={{ fontSize: 10, fontWeight: 700 }}>WIN RATE</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent2)' }}>{scoreData.personal_win_rate.toFixed(1)}%</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div className="muted" style={{ fontSize: 10, fontWeight: 700 }}>TOTAL PNL</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: scoreData.personal_total_pnl >= 0 ? 'var(--accent2)' : 'var(--danger)' }}>
                        {formatCurrency(scoreData.personal_total_pnl)}
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ padding: 16, border: '1px solid var(--border)', background: 'var(--panel2)' }}>
                    <div className="panelTitle" style={{ fontSize: 12, marginBottom: 8 }}>Market Quality Indicators</div>
                    <div className="metricRow">
                      <div className="muted">Fundamental Score</div>
                      <div style={{ fontWeight: 700 }}>{fundData?.fundamental_score || '—'} / 100</div>
                    </div>
                    <div className="metricRow">
                      <div className="muted">Market Cap</div>
                      <div style={{ fontWeight: 700 }}>${fmtNum(fundData?.market_cap)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 20 }}>
                  You haven't traded this stock yet. Your personal score will update as you record trades.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatCurrency(v: number) {
  return (v >= 0 ? '+' : '') + v.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}
