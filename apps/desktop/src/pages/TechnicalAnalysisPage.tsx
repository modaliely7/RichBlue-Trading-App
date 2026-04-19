import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

function fmt(v: number | string | null | undefined, d = 2) {
  if (v == null || v === 'n/a') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? '—' : n.toFixed(d)
}

function signalClass(signal: string | null | undefined) {
  if (!signal) return 'neutral'
  const s = signal.toLowerCase()
  if (s.includes('bullish') || s.includes('buy') || s.includes('strong')) return 'good'
  if (s.includes('bearish') || s.includes('sell')) return 'bad'
  return 'neutral'
}

function ScoreGauge({ score, signal }: { score: number; signal: string }) {
  const cls = score >= 60 ? 'good' : score <= 40 ? 'bad' : 'neutral'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div className={`scoreCircle ${cls}`}>
        <div className={`scoreNum ${cls === 'good' ? 'good' : cls === 'bad' ? 'bad' : ''}`}>{score}</div>
        <div className="scoreLabel">/ 100</div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>SIGNAL</div>
        <div className={`pill ${cls}`} style={{ fontSize: 14, fontWeight: 700, padding: '4px 14px' }}>{signal}</div>
      </div>
    </div>
  )
}

export function TechnicalAnalysisPage() {
  const [ticker, setTicker] = useState('')
  const [activeTicker, setActiveTicker] = useState('')
  const [refresh, setRefresh] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['technical', activeTicker, refresh],
    queryFn: () => api.technicalIndicators(activeTicker, '1y', '1d'),
    enabled: !!activeTicker,
    retry: false,
  })

  function analyze(forceRefresh = false) {
    const t = ticker.trim().toUpperCase()
    if (!t) return
    setRefresh(forceRefresh)
    setActiveTicker(t)
  }

  const ind = data?.payload?.indicators ?? {}
  const cls = signalClass(data?.signal)

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Technical Analysis</div>
          <div className="pageSubtitle">RSI, MACD, Moving Averages, Bollinger Bands & more — powered by yfinance</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 200 }}>
            <div className="label">Ticker Symbol</div>
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL, MSFT, AMZN, COIN"
              onKeyDown={e => { if (e.key === 'Enter') analyze(false) }}
              style={{ fontSize: 15 }}
            />
          </label>
          <button className="btn" disabled={!ticker.trim() || isLoading} onClick={() => analyze(false)}>
            {isLoading && !refresh ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Analyzing…</> : '📈 Analyze'}
          </button>
          <button className="btn btnGhost" disabled={!ticker.trim() || isLoading} onClick={() => analyze(true)}>
            {isLoading && refresh ? 'Refreshing…' : '↻ Force Refresh'}
          </button>
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{String((error as Error).message)}</div>}
      </div>

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Signal Banner */}
          <div className={`signalBanner ${cls}`}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#f8fafc' }}>{data.symbol}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Last Price: <strong style={{ color: '#f8fafc', fontSize: 16 }}>${fmt(data.payload?.price)}</strong>
                {data.fetched_at && <span style={{ marginLeft: 12, fontSize: 11 }}>Updated: {new Date(data.fetched_at).toLocaleString()}</span>}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <ScoreGauge score={data.score ?? 50} signal={data.signal ?? 'Neutral'} />
            </div>
          </div>

          {/* Indicators Grid */}
          <div className="grid panels">
            {/* Trend */}
            <div className="card panel">
              <div className="panelTitle">📉 Trend Indicators</div>
              {[
                ['SMA 20', ind.ma20, '$'],
                ['SMA 50', ind.ma50, '$'],
                ['SMA 200', ind.ma200, '$'],
                ['EMA 20', ind.ema20, '$'],
              ].map(([label, val, pre]) => (
                <div key={String(label)} className="metricRow">
                  <div className="metricKey">{label}</div>
                  <div className="metricVal">{pre}{fmt(val as number)}</div>
                </div>
              ))}
            </div>

            {/* Momentum */}
            <div className="card panel">
              <div className="panelTitle">⚡ Momentum & Volatility</div>
              {[
                ['RSI (14)', ind.rsi, '', ind.rsi > 70 ? 'bad' : ind.rsi < 30 ? 'good' : ''],
                ['MACD', ind.macd, '', ind.macd > 0 ? 'good' : 'bad'],
                ['MACD Signal', ind.macd_signal, '', ''],
                ['BB Upper', ind.bb_high, '$', ''],
                ['BB Lower', ind.bb_low, '$', ''],
                ['ATR (14)', ind.atr, '', ''],
                ['Stochastic', ind.stoch, '', ind.stoch > 80 ? 'bad' : ind.stoch < 20 ? 'good' : ''],
              ].map(([label, val, pre, tone]) => (
                <div key={String(label)} className="metricRow">
                  <div className="metricKey">{label}</div>
                  <div className={`metricVal ${tone}`}>{pre}{fmt(val as number)}</div>
                </div>
              ))}
            </div>

            {/* Bullish Signals */}
            <div className="card panel" style={{ borderTop: '3px solid rgba(16,185,129,0.5)' }}>
              <div className="panelTitle" style={{ color: 'var(--accent2)' }}>✅ Bullish Signals</div>
              {data.payload?.bullish_signals?.length > 0
                ? data.payload.bullish_signals.map((s: string, i: number) => (
                    <div key={i} className="metricRow" style={{ borderColor: 'rgba(16,185,129,0.1)' }}>
                      <span style={{ color: 'var(--accent2)' }}>▲</span>
                      <span style={{ flex: 1, marginLeft: 10, fontSize: 13 }}>{s}</span>
                    </div>
                  ))
                : <div className="muted" style={{ fontSize: 13 }}>No strong bullish signals at this time.</div>}
            </div>

            {/* Bearish Signals */}
            <div className="card panel" style={{ borderTop: '3px solid rgba(244,63,94,0.5)' }}>
              <div className="panelTitle" style={{ color: 'var(--danger)' }}>⚠ Bearish Signals</div>
              {data.payload?.bearish_signals?.length > 0
                ? data.payload.bearish_signals.map((s: string, i: number) => (
                    <div key={i} className="metricRow" style={{ borderColor: 'rgba(244,63,94,0.1)' }}>
                      <span style={{ color: 'var(--danger)' }}>▼</span>
                      <span style={{ flex: 1, marginLeft: 10, fontSize: 13 }}>{s}</span>
                    </div>
                  ))
                : <div className="muted" style={{ fontSize: 13 }}>No strong bearish signals at this time.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
