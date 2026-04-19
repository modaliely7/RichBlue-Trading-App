import { useState } from 'react'
import { api } from '../lib/api'

export function SmartMoneyPage() {
  const [symbol, setSymbol] = useState('AAPL')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any | null>(null)

  async function fetchSmart() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await api.smartMoney(symbol)
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
          <div className="pageTitle">Quantitative & Smart Money Analysis</div>
          <div className="pageSubtitle">Unusual volume, accumulation/distribution, breakout probability</div>
        </div>
      </div>
      <div className="card panel">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          <button onClick={fetchSmart} disabled={loading || !symbol.trim()}>
            {loading ? 'Loading...' : 'Analyze'}
          </button>
        </div>
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
        {data && (
          <div style={{ marginTop: 12 }}>
            <div><strong>Bias:</strong> {data.bias}</div>
            <div><strong>Big buys (30d):</strong> {data.big_buy_30}</div>
            <div><strong>Big sells (30d):</strong> {data.big_sell_30}</div>
            <div><strong>OBV slope:</strong> {data.obv_slope}</div>
            <div style={{ marginTop: 8 }}>
              <pre style={{ maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(data, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
