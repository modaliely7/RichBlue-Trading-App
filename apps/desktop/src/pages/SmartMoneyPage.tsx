import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

function fmt(v: number | null | undefined, d = 2) {
  if (v == null || isNaN(Number(v))) return '—'
  return Number(v).toFixed(d)
}

function scoreTone(s: number) {
  return s >= 60 ? 'good' : s <= 40 ? 'bad' : 'neutral'
}

export function SmartMoneyPage() {
  const [ticker, setTicker] = useState('')
  const [activeTicker, setActiveTicker] = useState('')
  const [forceRefresh, setForceRefresh] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['smart-money', activeTicker, forceRefresh],
    queryFn: () => api.smartMoney(activeTicker, '6m', '1d'),
    enabled: !!activeTicker,
    retry: false,
  })

  function analyze(refresh = false) {
    const t = ticker.trim().toUpperCase()
    if (!t) return
    setForceRefresh(refresh)
    setActiveTicker(t)
  }

  const score = data?.score ?? 50
  const tone = scoreTone(score)
  const payload = data?.payload ?? {}

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Smart Money & Quant</div>
          <div className="pageSubtitle">Volume analysis, institutional flow, A/D, VWAP & breakout probability</div>
        </div>
      </div>

      <div className="card panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 200 }}>
            <div className="label">Ticker Symbol</div>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL, MSFT, SPY"
              onKeyDown={e => { if (e.key === 'Enter') analyze(false) }} style={{ fontSize: 15 }} />
          </label>
          <button className="btn" disabled={!ticker.trim() || isLoading} onClick={() => analyze(false)}>
            {isLoading && !forceRefresh ? '⟳ Analyzing…' : '🧠 Analyze'}
          </button>
          <button className="btn btnGhost" disabled={!ticker.trim() || isLoading} onClick={() => analyze(true)}>
            {isLoading && forceRefresh ? 'Refreshing…' : '↻ Force Refresh'}
          </button>
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{String((error as Error).message)}</div>}
      </div>

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Banner */}
          <div className={`signalBanner ${tone === 'good' ? 'bullish' : tone === 'bad' ? 'bearish' : ''}`}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#f8fafc' }}>{data.symbol}</div>
              {data.fetched_at && (
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Updated: {new Date(data.fetched_at).toLocaleString()}
                </div>
              )}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className={`scoreCircle ${tone}`}>
                <div className={`scoreNum ${tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : ''}`}>{score}</div>
                <div className="scoreLabel">/ 100</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>FLOW SIGNAL</div>
                <div className={`pill ${tone}`} style={{ fontSize: 14, fontWeight: 700, marginTop: 4, padding: '6px 16px' }}>
                  {data.signal ?? 'Neutral'}
                </div>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid kpis">
            <div className="card kpi">
              <div className="kpiLabel">VWAP</div>
              <div className="kpiValue" style={{ fontSize: 20 }}>${fmt(payload.vwap)}</div>
              <div className="kpiSub">Volume Weighted Avg Price</div>
            </div>
            <div className={`card kpi ${payload.rvol > 2 ? 'tone-good' : payload.rvol < 0.5 ? 'tone-bad' : ''}`}>
              <div className="kpiLabel">Relative Volume</div>
              <div className="kpiValue" style={{ fontSize: 20 }}>{fmt(payload.rvol)}x</div>
              <div className="kpiSub">{payload.unusual_volume ?? '—'}</div>
            </div>
            <div className={`card kpi ${payload.cmf > 0.1 ? 'tone-good' : payload.cmf < -0.1 ? 'tone-bad' : ''}`}>
              <div className="kpiLabel">Chaikin Money Flow</div>
              <div className="kpiValue" style={{ fontSize: 20 }}>{fmt(payload.cmf)}</div>
              <div className="kpiSub">{payload.ad_status ?? '—'}</div>
            </div>
            <div className={`card kpi ${(payload.breakout_probability ?? 0) > 60 ? 'tone-good' : ''}`}>
              <div className="kpiLabel">Breakout Probability</div>
              <div className="kpiValue" style={{ fontSize: 20 }}>{fmt(payload.breakout_probability, 0)}%</div>
              <div className="kpiSub">Based on volatility contraction + RVOL</div>
            </div>
          </div>

          {/* Breakout probability bar */}
          <div className="card panel">
            <div className="panelTitle">📊 Flow Analysis Detail</div>
            {[
              { label: 'Volume Status', val: payload.unusual_volume ?? '—', tone: payload.rvol > 2 ? 'good' : payload.rvol < 0.5 ? 'bad' : '' },
              { label: 'Accumulation / Distribution', val: payload.ad_status ?? '—', tone: payload.cmf > 0.1 ? 'good' : payload.cmf < -0.1 ? 'bad' : '' },
              { label: 'RVOL (Relative Volume)', val: fmt(payload.rvol) + 'x', tone: payload.rvol > 1.5 ? 'good' : '' },
              { label: 'CMF (Chaikin)', val: fmt(payload.cmf), tone: payload.cmf > 0.1 ? 'good' : payload.cmf < -0.1 ? 'bad' : '' },
              { label: 'VWAP', val: '$' + fmt(payload.vwap), tone: '' },
              { label: 'Breakout Probability', val: fmt(payload.breakout_probability, 0) + '%', tone: (payload.breakout_probability ?? 0) > 60 ? 'good' : '' },
            ].map(row => (
              <div key={row.label} className="metricRow">
                <div className="metricKey">{row.label}</div>
                <div className={`metricVal ${row.tone}`}>{row.val}</div>
              </div>
            ))}

            {/* Visual bar for breakout prob */}
            {payload.breakout_probability != null && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span className="muted">Breakout Probability</span>
                  <span style={{ fontWeight: 700, color: (payload.breakout_probability ?? 0) > 60 ? 'var(--accent2)' : '#f8fafc' }}>
                    {fmt(payload.breakout_probability, 0)}%
                  </span>
                </div>
                <div className="progressBar">
                  <div
                    className={`progressFill ${(payload.breakout_probability ?? 0) > 60 ? 'good' : (payload.breakout_probability ?? 0) < 40 ? 'bad' : 'accent'}`}
                    style={{ width: `${Math.min(100, payload.breakout_probability ?? 0)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
