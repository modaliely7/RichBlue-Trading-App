import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Line } from 'react-chartjs-2'
import { api } from '../lib/api'
import type { QuantRow } from '../lib/api'

function getNum(r: QuantRow, k: string) {
  const v = r[k]
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function fmt(v: number | null | undefined, d = 2) {
  if (v == null || isNaN(Number(v))) return '—'
  return Number(v).toFixed(d)
}

type Mode = 'csv' | 'live'

export function QuantPage() {
  const [mode, setMode] = useState<Mode>('live')

  // ── Live ticker mode ──────────────────────────────────
  const [ticker, setTicker] = useState('')
  const [activeTicker, setActiveTicker] = useState('')
  const [forceRefresh, setForceRefresh] = useState(false)

  const liveQuery = useQuery({
    queryKey: ['quant-live', activeTicker, forceRefresh],
    queryFn: () => api.quantLive(activeTicker, '6m', '1d'),
    enabled: !!activeTicker && mode === 'live',
    retry: false,
  })

  function analyzeLive(refresh = false) {
    const t = ticker.trim().toUpperCase()
    if (!t) return
    setForceRefresh(refresh)
    setActiveTicker(t)
  }

  // ── CSV upload mode ───────────────────────────────────
  const [file, setFile] = useState<File | null>(null)
  const [rsiPeriod, setRsiPeriod] = useState(14)
  const [sma1, setSma1] = useState(20)
  const [sma2, setSma2] = useState(50)
  const [showRsi, setShowRsi] = useState(true)
  const [showMacd, setShowMacd] = useState(true)
  const [showBbands, setShowBbands] = useState(true)
  const [showVwap, setShowVwap] = useState(true)

  const csvMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected')
      return await api.quantIndicators(file, { rsi_period: rsiPeriod, sma_1: sma1, sma_2: sma2 })
    },
  })

  const rows = csvMutation.data?.rows ?? []
  const labels = useMemo(() => rows.map(r => String(r.date).slice(0, 10)), [rows])

  const chartData = useMemo(() => {
    const close = rows.map(r => getNum(r, 'close'))
    const ds: any[] = [
      { label: 'Close', data: close, borderColor: 'rgba(203,213,225,0.9)', backgroundColor: 'rgba(203,213,225,0.05)', pointRadius: 0, tension: 0.2 },
      { label: `SMA ${sma1}`, data: rows.map(r => getNum(r, `sma_${sma1}`)), borderColor: 'rgba(139,92,246,0.9)', pointRadius: 0, tension: 0.2 },
      { label: `SMA ${sma2}`, data: rows.map(r => getNum(r, `sma_${sma2}`)), borderColor: 'rgba(16,185,129,0.85)', pointRadius: 0, tension: 0.2 },
    ]
    if (showVwap) ds.push({ label: 'VWAP', data: rows.map(r => getNum(r, 'vwap')), borderColor: 'rgba(56,189,248,0.85)', pointRadius: 0, tension: 0.2 })
    if (showBbands) {
      ds.push({ label: 'BB Upper', data: rows.map(r => getNum(r, 'bb_upper')), borderColor: 'rgba(148,163,184,0.4)', pointRadius: 0, tension: 0.15 })
      ds.push({ label: 'BB Lower', data: rows.map(r => getNum(r, 'bb_lower')), borderColor: 'rgba(148,163,184,0.4)', pointRadius: 0, tension: 0.15 })
    }
    return { labels, datasets: ds }
  }, [labels, rows, showBbands, showVwap, sma1, sma2])

  const last = rows.length ? rows[rows.length - 1] : null

  // ── Live data display ─────────────────────────────────
  const ld = liveQuery.data
  const livePayload = ld?.payload ?? {}
  const liveScore = ld?.score ?? 50

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Quant Analysis</div>
          <div className="pageSubtitle">Institutional flow, RSI/MACD/BB — live ticker or CSV upload</div>
        </div>
        <div className="detailsActions">
          <button className={`btn ${mode === 'live' ? '' : 'btnGhost'}`} onClick={() => setMode('live')}>🧠 Live Ticker</button>
          <button className={`btn ${mode === 'csv' ? '' : 'btnGhost'}`} onClick={() => setMode('csv')}>📂 CSV Upload</button>
        </div>
      </div>

      {/* ── Live Mode ──────────────────────────────────── */}
      {mode === 'live' && (
        <>
          <div className="card panel" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ flex: 1, minWidth: 200 }}>
                <div className="label">Ticker Symbol</div>
                <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. AAPL, MSFT, SPY"
                  onKeyDown={e => { if (e.key === 'Enter') analyzeLive(false) }} style={{ fontSize: 15 }} />
              </label>
              <button className="btn" disabled={!ticker.trim() || liveQuery.isLoading} onClick={() => analyzeLive(false)}>
                {liveQuery.isLoading && !forceRefresh ? '⟳ Analyzing…' : '📊 Analyze'}
              </button>
              <button className="btn btnGhost" disabled={!ticker.trim() || liveQuery.isLoading} onClick={() => analyzeLive(true)}>
                {liveQuery.isLoading && forceRefresh ? 'Refreshing…' : '↻ Refresh'}
              </button>
            </div>
            {liveQuery.error && <div className="error" style={{ marginTop: 10 }}>{String((liveQuery.error as Error).message)}</div>}
          </div>

          {ld && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className={`signalBanner ${liveScore >= 60 ? 'bullish' : liveScore <= 40 ? 'bearish' : ''}`}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#f8fafc' }}>{ld.symbol}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {ld.fetched_at && <>Updated: {new Date(ld.fetched_at).toLocaleString()}</>}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div className={`scoreCircle ${liveScore >= 60 ? 'good' : liveScore <= 40 ? 'bad' : 'neutral'}`}>
                    <div className={`scoreNum ${liveScore >= 60 ? 'good' : liveScore <= 40 ? 'bad' : ''}`}>{liveScore}</div>
                    <div className="scoreLabel">/ 100</div>
                  </div>
                  <div className={`pill ${liveScore >= 60 ? 'good' : liveScore <= 40 ? 'bad' : 'neutral'}`} style={{ fontSize: 14, fontWeight: 700, padding: '6px 16px' }}>
                    {ld.signal ?? 'Neutral'}
                  </div>
                </div>
              </div>

              <div className="grid kpis">
                {[
                  { label: 'VWAP', val: '$' + fmt(livePayload.vwap), sub: 'Vol Weighted Avg Price', tone: '' },
                  { label: 'Relative Volume', val: fmt(livePayload.rvol) + 'x', sub: livePayload.unusual_volume ?? '—', tone: livePayload.rvol > 2 ? 'tone-good' : livePayload.rvol < 0.5 ? 'tone-bad' : '' },
                  { label: 'Money Flow (CMF)', val: fmt(livePayload.cmf), sub: livePayload.ad_status ?? '—', tone: livePayload.cmf > 0.1 ? 'tone-good' : livePayload.cmf < -0.1 ? 'tone-bad' : '' },
                  { label: 'Breakout Prob.', val: fmt(livePayload.breakout_probability, 0) + '%', sub: 'Volatility + volume signal', tone: (livePayload.breakout_probability ?? 0) > 60 ? 'tone-good' : '' },
                ].map(k => (
                  <div key={k.label} className={`card kpi ${k.tone}`}>
                    <div className="kpiLabel">{k.label}</div>
                    <div className="kpiValue" style={{ fontSize: 20 }}>{k.val}</div>
                    <div className="kpiSub">{k.sub}</div>
                  </div>
                ))}
              </div>

              <div className="card panel">
                <div className="panelTitle">📊 Breakout Probability</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                  <span className="muted">Probability</span>
                  <span style={{ fontWeight: 700 }}>{fmt(livePayload.breakout_probability, 0)}%</span>
                </div>
                <div className="progressBar" style={{ height: 8 }}>
                  <div className={`progressFill ${(livePayload.breakout_probability ?? 0) > 60 ? 'good' : (livePayload.breakout_probability ?? 0) < 40 ? 'bad' : 'accent'}`}
                    style={{ width: `${Math.min(100, livePayload.breakout_probability ?? 0)}%` }} />
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
                  Based on volatility contraction (ATR &lt; ATR SMA), relative volume {'>'} 1.5x, and price vs VWAP.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CSV Mode ────────────────────────────────────── */}
      {mode === 'csv' && (
        <>
          <div className="card panel">
            <div className="panelTitle">📂 Upload OHLCV CSV</div>
            <div className="detailsActions">
              <label className="fileBtn">
                <input type="file" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; setFile(f ?? null); e.currentTarget.value = '' }} />
                {file ? `✓ ${file.name}` : 'Choose CSV file'}
              </label>
              <button className="btn" disabled={!file || csvMutation.isPending} onClick={() => csvMutation.mutate()}>
                {csvMutation.isPending ? '⟳ Computing…' : '⚡ Compute Indicators'}
              </button>
            </div>
            {csvMutation.error && <div className="error">{String((csvMutation.error as Error)?.message)}</div>}
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Required columns: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 4 }}>date, open, high, low, close, volume</code>
            </div>
          </div>

          <div className="card panel" style={{ marginTop: 14 }}>
            <div className="panelTitle">⚙ Settings</div>
            <div className="formGrid">
              <label><div className="label">RSI Period</div><input type="number" value={rsiPeriod} onChange={e => setRsiPeriod(Number(e.target.value))} /></label>
              <label><div className="label">SMA 1</div><input type="number" value={sma1} onChange={e => setSma1(Number(e.target.value))} /></label>
              <label><div className="label">SMA 2</div><input type="number" value={sma2} onChange={e => setSma2(Number(e.target.value))} /></label>
              <div />
            </div>
            <div className="detailsActions" style={{ marginTop: 12 }}>
              {([
                ['VWAP', showVwap, setShowVwap],
                ['Bollinger Bands', showBbands, setShowBbands],
                ['RSI table', showRsi, setShowRsi],
                ['MACD table', showMacd, setShowMacd],
              ] as const).map(([lbl, val, fn]) => (
                <label key={lbl} className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={val} onChange={e => (fn as any)(e.target.checked)} />
                  {lbl}
                </label>
              ))}
            </div>
          </div>

          <div className="card panel" style={{ marginTop: 14 }}>
            <div className="panelTitle">📈 Chart</div>
            <div className="chartWrapper">
              {rows.length
                ? <Line data={chartData} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: 'rgba(148,163,184,0.9)', usePointStyle: true, font: { size: 11 } } } },
                    scales: {
                      x: { ticks: { maxTicksLimit: 8, color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
                      y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
                    },
                  }} />
                : <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>Upload a CSV and compute indicators to see the chart.</div>
              }
            </div>
          </div>

          {(showRsi || showMacd) && last && (
            <div className="card panel" style={{ marginTop: 14 }}>
              <div className="panelTitle">Latest Values</div>
              <div className="tableWrap">
                <table className="table">
                  <thead><tr>
                    <th>Date</th><th>Close</th>
                    {showRsi && <th>RSI</th>}
                    {showMacd && <><th>MACD</th><th>Signal</th><th>Histogram</th></>}
                  </tr></thead>
                  <tbody><tr>
                    <td className="mono">{String(last.date).slice(0, 16).replace('T', ' ')}</td>
                    <td className="mono">{getNum(last, 'close')?.toFixed(4) ?? '—'}</td>
                    {showRsi && <td className="mono">{getNum(last, 'rsi')?.toFixed(2) ?? '—'}</td>}
                    {showMacd && <>
                      <td className="mono">{getNum(last, 'macd')?.toFixed(4) ?? '—'}</td>
                      <td className="mono">{getNum(last, 'macd_signal')?.toFixed(4) ?? '—'}</td>
                      <td className="mono">{getNum(last, 'macd_hist')?.toFixed(4) ?? '—'}</td>
                    </>}
                  </tr></tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
