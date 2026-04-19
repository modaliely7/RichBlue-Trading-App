import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

function fmtNum(v: number | string | null | undefined, d = 2) {
  if (v == null || v === 'n/a') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '—'
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(d) + 'B'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(d) + 'M'
  return n.toFixed(d)
}

function scoreTone(s: number | null | undefined) {
  if (s == null) return 'neutral'
  return s >= 65 ? 'good' : s <= 35 ? 'bad' : 'neutral'
}

export function StockFundamentalsPage() {
  const [ticker, setTicker] = useState('')
  const [activeTicker, setActiveTicker] = useState('')
  const [forceRefresh, setForceRefresh] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['fundamentals', activeTicker, forceRefresh],
    queryFn: () => api.fundamentals(activeTicker, forceRefresh),
    enabled: !!activeTicker,
    retry: false,
  })

  function analyze(refresh = false) {
    const t = ticker.trim().toUpperCase()
    if (!t) return
    setForceRefresh(refresh)
    setActiveTicker(t)
  }

  const tone = scoreTone(data?.fundamental_score)

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Fundamental Analysis</div>
          <div className="pageSubtitle">Valuation, growth, profitability & financial health — yfinance</div>
        </div>
      </div>

      <div className="card panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 200 }}>
            <div className="label">Ticker Symbol</div>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL, MSFT, GOOGL"
              onKeyDown={e => { if (e.key === 'Enter') analyze(false) }} style={{ fontSize: 15 }} />
          </label>
          <button className="btn" disabled={!ticker.trim() || isLoading} onClick={() => analyze(false)}>
            {isLoading && !forceRefresh ? '⟳ Loading…' : '🏦 Analyze'}
          </button>
          <button className="btn btnGhost" disabled={!ticker.trim() || isLoading} onClick={() => analyze(true)}>
            {isLoading && forceRefresh ? 'Fetching…' : '↻ Force Refresh'}
          </button>
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{String((error as Error).message)}</div>}
      </div>

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className={`signalBanner ${tone === 'good' ? 'bullish' : tone === 'bad' ? 'bearish' : ''}`}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#f8fafc' }}>{data.symbol}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                Price: <strong style={{ color: '#f8fafc', fontSize: 16 }}>${fmtNum(data.current_price)}</strong>
                {data.provider && <span style={{ marginLeft: 12, fontSize: 11 }}>via {data.provider}</span>}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className={`scoreCircle ${tone}`}>
                <div className={`scoreNum ${tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : ''}`}>{data.fundamental_score ?? '—'}</div>
                <div className="scoreLabel">Score</div>
              </div>
              <div className={`pill ${tone}`} style={{ fontSize: 14, fontWeight: 700, padding: '6px 16px' }}>
                {(data.fundamental_score ?? 0) >= 65 ? 'Strong' : (data.fundamental_score ?? 0) <= 35 ? 'Weak' : 'Moderate'}
              </div>
            </div>
          </div>

          <div className="grid kpis">
            {[
              { label: 'Market Cap', val: '$' + fmtNum(data.market_cap), tone: '' },
              { label: 'P/E Ratio', val: fmtNum(data.pe_ratio), tone: data.pe_ratio > 0 && data.pe_ratio < 20 ? 'tone-good' : data.pe_ratio > 30 ? 'tone-bad' : '' },
              { label: 'EPS (TTM)', val: '$' + fmtNum(data.eps), tone: data.eps > 0 ? 'tone-good' : 'tone-bad' },
              { label: 'Debt / Equity', val: fmtNum(data.debt_to_equity), tone: data.debt_to_equity < 1 ? 'tone-good' : data.debt_to_equity > 2 ? 'tone-bad' : '' },
            ].map(k => (
              <div key={k.label} className={`card kpi ${k.tone}`}>
                <div className="kpiLabel">{k.label}</div>
                <div className="kpiValue" style={{ fontSize: 20 }}>{k.val}</div>
              </div>
            ))}
          </div>

          <div className="grid panels">
            <div className="card panel">
              <div className="panelTitle">📊 Growth & Profitability</div>
              {[
                ['Revenue Growth (CAGR)', fmtNum(data.revenue_growth) + '%', data.revenue_growth > 0 ? 'good' : data.revenue_growth < 0 ? 'bad' : ''],
                ['EPS Growth (CAGR)', fmtNum(data.eps_growth) + '%', data.eps_growth > 0 ? 'good' : data.eps_growth < 0 ? 'bad' : ''],
                ['ROE', fmtNum(data.roe) + '%', data.roe > 15 ? 'good' : data.roe < 5 ? 'bad' : ''],
                ['Net Profit Margin', fmtNum(data.net_profit_margin) + '%', data.net_profit_margin > 10 ? 'good' : data.net_profit_margin < 0 ? 'bad' : ''],
                ['FCF Yield', fmtNum(data.fcf_yield) + '%', data.fcf_yield > 4 ? 'good' : data.fcf_yield < 0 ? 'bad' : ''],
              ].map(([label, val, tone]) => (
                <div key={String(label)} className="metricRow">
                  <div className="metricKey">{label}</div>
                  <div className={`metricVal ${tone}`}>{val}</div>
                </div>
              ))}
            </div>

            <div className="card panel">
              <div className="panelTitle">💰 Valuation</div>
              {[
                ['EV / EBITDA', fmtNum(data.ev_ebitda), ''],
                ['Current Ratio', fmtNum(data.current_ratio), data.current_ratio > 1.5 ? 'good' : data.current_ratio < 1 ? 'bad' : ''],
                ['Fair Value (P/E)', '$' + fmtNum(data.fair_value_pe), data.fair_value_pe > data.current_price ? 'good' : 'bad'],
                ['Fair Value (PEG)', '$' + fmtNum(data.fair_value_peg), data.fair_value_peg > data.current_price ? 'good' : 'bad'],
                ['Free Cash Flow', '$' + fmtNum(data.free_cash_flow), data.free_cash_flow > 0 ? 'good' : 'bad'],
              ].map(([label, val, tone]) => (
                <div key={String(label)} className="metricRow">
                  <div className="metricKey">{label}</div>
                  <div className={`metricVal ${tone}`}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
