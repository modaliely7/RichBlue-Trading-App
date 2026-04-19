import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { OverviewSyncBar } from '../components/OverviewSyncBar'

export function StockFundamentalsPage() {
  const [ticker, setTicker] = useState('')
  const [refreshFlag, setRefreshFlag] = useState(false)
  const { data, isLoading, refetch } = useQuery({ queryKey: ['fundamentals', ticker, refreshFlag], queryFn: () => api.fundamentals(ticker, refreshFlag), enabled: false })

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Stock Fundamental Analysis</div>
          <div className="pageSubtitle">Valuation models, fundamental score and fair value estimates</div>
        </div>
        <div className="detailsActions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <OverviewSyncBar />
        </div>
      </div>

      <div className="card panel">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Ticker (e.g. AAPL)" />
          <button
            className="btn"
            disabled={!ticker.trim()}
            onClick={async () => {
              setRefreshFlag(false)
              await refetch()
            }}
          >
            Load
          </button>
          <button
            className="btn"
            disabled={!ticker.trim()}
            onClick={async () => {
              setRefreshFlag(true)
              await refetch()
            }}
          >
            Refresh
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {isLoading ? (
            <div className="muted">Loading…</div>
          ) : data ? (
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{data.symbol}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div>Price: {data.current_price}</div>
                <div>Market cap: {data.market_cap}</div>
                <div>EPS: {data.eps}</div>
                <div>Fundamental score: {data.fundamental_score ?? 'n/a'}</div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div>P/E: {data.pe_ratio ?? 'n/a'}</div>
                <div>EV/EBITDA: {data.ev_ebitda ?? 'n/a'}</div>
                <div>ROE: {data.roe ?? 'n/a'}</div>
                <div>Net profit margin: {data.net_profit_margin ?? 'n/a'}</div>
                <div>Revenue growth (CAGR %): {data.revenue_growth ?? 'n/a'}</div>
                <div>EPS growth (CAGR %): {data.eps_growth ?? 'n/a'}</div>
                <div>Debt/Equity: {data.debt_to_equity ?? 'n/a'}</div>
                <div>FCF yield %: {data.fcf_yield ?? 'n/a'}</div>
                <div>Fair value (P/E): {data.fair_value_pe ?? 'n/a'}</div>
                <div>Fair value (PEG): {data.fair_value_peg ?? 'n/a'}</div>
              </div>
            </div>
          ) : (
            <div className="muted">Enter a ticker and click Load or Refresh.</div>
          )}
        </div>
      </div>
    </div>
  )
}
