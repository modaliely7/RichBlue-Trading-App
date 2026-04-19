import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Line } from 'react-chartjs-2'
import { api } from '../lib/api'
import type { QuantRow } from '../lib/api'

function getNum(r: QuantRow, k: string) {
  const v = r[k]
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function QuantPage() {
  const [file, setFile] = useState<File | null>(null)
  const [rsiPeriod, setRsiPeriod] = useState(14)
  const [sma1, setSma1] = useState(20)
  const [sma2, setSma2] = useState(50)
  const [showRsi, setShowRsi] = useState(true)
  const [showMacd, setShowMacd] = useState(true)
  const [showBbands, setShowBbands] = useState(true)
  const [showVwap, setShowVwap] = useState(true)

  const quant = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected')
      return await api.quantIndicators(file, { rsi_period: rsiPeriod, sma_1: sma1, sma_2: sma2 })
    },
  })

  const rows = quant.data?.rows ?? []
  const labels = useMemo(() => rows.map((r) => String(r.date).slice(0, 10)), [rows])

  const chartData = useMemo(() => {
    const close = rows.map((r) => getNum(r, 'close'))
    const ds: any[] = [
      {
        label: 'Close',
        data: close,
        borderColor: 'rgba(203,213,225,0.9)',
        backgroundColor: 'rgba(203,213,225,0.1)',
        pointRadius: 0,
        tension: 0.2,
      },
    ]

    const smaK1 = `sma_${sma1}`
    const smaK2 = `sma_${sma2}`
    ds.push({
      label: smaK1.toUpperCase(),
      data: rows.map((r) => getNum(r, smaK1)),
      borderColor: 'rgba(124,58,237,0.9)',
      pointRadius: 0,
      tension: 0.2,
    })
    ds.push({
      label: smaK2.toUpperCase(),
      data: rows.map((r) => getNum(r, smaK2)),
      borderColor: 'rgba(34,197,94,0.85)',
      pointRadius: 0,
      tension: 0.2,
    })

    if (showVwap) {
      ds.push({
        label: 'VWAP',
        data: rows.map((r) => getNum(r, 'vwap')),
        borderColor: 'rgba(59,130,246,0.85)',
        pointRadius: 0,
        tension: 0.2,
      })
    }

    if (showBbands) {
      ds.push({
        label: 'BB Upper',
        data: rows.map((r) => getNum(r, 'bb_upper')),
        borderColor: 'rgba(148,163,184,0.45)',
        pointRadius: 0,
        tension: 0.15,
      })
      ds.push({
        label: 'BB Lower',
        data: rows.map((r) => getNum(r, 'bb_lower')),
        borderColor: 'rgba(148,163,184,0.45)',
        pointRadius: 0,
        tension: 0.15,
      })
    }

    // MACD/RSI are computed but not plotted on same axis by default; we show them as a small table below.
    return { labels, datasets: ds }
  }, [labels, rows, showBbands, showVwap, sma1, sma2])

  const last = rows.length ? rows[rows.length - 1] : null

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Quant Analysis</div>
          <div className="pageSubtitle">Upload OHLCV CSV and compute indicators (RSI/MACD/SMA/BB/VWAP)</div>
        </div>
      </div>

      <div className="card panel">
        <div className="panelTitle">Data Source</div>
        <div className="detailsActions">
          <label className="fileBtn">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                setFile(f ?? null)
                e.currentTarget.value = ''
              }}
            />
            {file ? `Selected: ${file.name}` : 'Choose OHLCV CSV'}
          </label>
          <button className="btn btnGhost" disabled={!file || quant.isPending} onClick={() => quant.mutate()}>
            {quant.isPending ? 'Computing…' : 'Compute Indicators'}
          </button>
        </div>
        {quant.error ? (
          <div className="error">
            {String((quant.error as Error)?.message ?? 'Quant computation failed')}
          </div>
        ) : null}
        <div className="muted" style={{ marginTop: 10 }}>
          Required columns: <span className="mono">date, open, high, low, close, volume</span>
        </div>
      </div>

      <div className="card panel" style={{ marginTop: 12 }}>
        <div className="panelTitle">Settings</div>
        <div className="formGrid">
          <label>
            <div className="label">RSI period</div>
            <input type="number" value={rsiPeriod} onChange={(e) => setRsiPeriod(Number(e.target.value))} />
          </label>
          <label>
            <div className="label">SMA 1</div>
            <input type="number" value={sma1} onChange={(e) => setSma1(Number(e.target.value))} />
          </label>
          <label>
            <div className="label">SMA 2</div>
            <input type="number" value={sma2} onChange={(e) => setSma2(Number(e.target.value))} />
          </label>
          <label>
            <div className="label">Overlays</div>
            <select
              value="—"
              onChange={() => {
                /* no-op; use checkboxes below */
              }}
            >
              <option value="—">Use toggles below</option>
            </select>
          </label>
        </div>
        <div className="detailsActions" style={{ marginTop: 10 }}>
          <label className="muted">
            <input type="checkbox" checked={showVwap} onChange={(e) => setShowVwap(e.target.checked)} /> VWAP
          </label>
          <label className="muted">
            <input type="checkbox" checked={showBbands} onChange={(e) => setShowBbands(e.target.checked)} /> Bollinger
            Bands
          </label>
          <label className="muted">
            <input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} /> RSI (table)
          </label>
          <label className="muted">
            <input type="checkbox" checked={showMacd} onChange={(e) => setShowMacd(e.target.checked)} /> MACD (table)
          </label>
        </div>
      </div>

      <div className="card panel" style={{ marginTop: 12 }}>
        <div className="panelTitle">Chart</div>
        {rows.length ? (
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { labels: { color: 'rgba(148,163,184,0.95)' } } },
              scales: {
                x: { ticks: { maxTicksLimit: 8, color: 'rgba(148,163,184,0.9)' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                y: { ticks: { color: 'rgba(148,163,184,0.9)' }, grid: { color: 'rgba(148,163,184,0.08)' } },
              },
            }}
            height={260}
          />
        ) : (
          <div className="muted">Upload a CSV and compute indicators to see the chart.</div>
        )}
      </div>

      {(showRsi || showMacd) && last ? (
        <div className="card panel" style={{ marginTop: 12 }}>
          <div className="panelTitle">Latest values</div>
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Close</th>
                  {showRsi ? <th>RSI</th> : null}
                  {showMacd ? <th>MACD</th> : null}
                  {showMacd ? <th>Signal</th> : null}
                  {showMacd ? <th>Hist</th> : null}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">{String(last.date).slice(0, 16).replace('T', ' ')}</td>
                  <td className="mono">{getNum(last, 'close')?.toFixed(4) ?? '—'}</td>
                  {showRsi ? <td className="mono">{getNum(last, 'rsi')?.toFixed(2) ?? '—'}</td> : null}
                  {showMacd ? <td className="mono">{getNum(last, 'macd')?.toFixed(4) ?? '—'}</td> : null}
                  {showMacd ? <td className="mono">{getNum(last, 'macd_signal')?.toFixed(4) ?? '—'}</td> : null}
                  {showMacd ? <td className="mono">{getNum(last, 'macd_hist')?.toFixed(4) ?? '—'}</td> : null}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

