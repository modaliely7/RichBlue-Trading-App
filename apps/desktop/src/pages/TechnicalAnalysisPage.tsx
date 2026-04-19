import { useState } from 'react'
import { api } from '../lib/api'

export function TechnicalAnalysisPage() {
  const [symbol, setSymbol] = useState('AAPL')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any | null>(null)

  async function fetchIndicators() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await api.technicalIndicators(symbol)
      setData(res)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Technical Analysis</div>
          <div className="pageSubtitle">Charts, indicators and technical scoring</div>
        </div>
      </div>

      <div className="card panel">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          <button onClick={fetchIndicators} disabled={loading || !symbol.trim()}>
            {loading ? 'Loading...' : 'Fetch Indicators'}
          </button>
        </div>
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
        {data && (
          <div style={{ marginTop: 12 }}>
            <div><strong>Summary:</strong></div>
            <pre style={{ maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(data.summary || data.latest || {}, null, 2)}</pre>
            <div style={{ marginTop: 8 }}>
              <div><strong>Latest close:</strong> {data.latest?.close ?? 'n/a'}</div>
              <div><strong>RSI:</strong> {data.latest?.rsi14 ?? 'n/a'}</div>
              <div><strong>SMA20:</strong> {data.latest?.sma20 ?? 'n/a'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
