import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { api, type OverviewResponse, type Strategy } from '../lib/api'
import type { Market, TradeCreate } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useAccount } from '../components/AccountContext'
import { StrategySelect } from '../components/StrategySelect'

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function normalizeDecimalTyping(prev: string, raw: string): string {
  if (raw === '') return ''
  if (!/^-?\d*\.?\d*$/.test(raw)) return prev
  return raw.replace(/^(-?)0+(?=\d)/, '$1')
}

function parseDecimal(s: string): number {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function evaluateEquation(eq: string): number {
  if (!eq.trim()) return 0
  try {
    let sanitized = eq.replace(/(\d*\.?\d+)%/g, '($1/100)')
    sanitized = sanitized.replace(/[^0-9.\+\-\*\/\(\)\s]/g, '')
    // eslint-disable-next-line no-eval
    const result = eval(sanitized)
    return Number.isFinite(result) ? result : 0
  } catch {
    return 0
  }
}

export function AddTradePage() {
  const { currentAccount } = useAccount()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const accountId = currentAccount?.id ?? 1

  const { data: ov } = useQuery<OverviewResponse>({ 
    queryKey: ['overview', accountId], 
    queryFn: () => api.overview(accountId) 
  })

  const [symbol, setSymbol] = useState('')
  const [market, setMarket] = useState<Market>('Stocks')
  const [entryPriceStr, setEntryPriceStr] = useState('')
  const [exitPriceStr, setExitPriceStr] = useState('')
  const [sizeStr, setSizeStr] = useState('')
  const [feesStr, setFeesStr] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<number[]>([])
  
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectedName, setDetectedName] = useState<string | null>(null)
  const [isAutoFees, setIsAutoFees] = useState(true)

  const defaultEntry = useMemo(() => toDatetimeLocalValue(new Date().toISOString()), [])
  const [entryDateLocal, setEntryDateLocal] = useState(defaultEntry)
  const [exitDateLocal, setExitDateLocal] = useState('')

  useEffect(() => {
    const sym = symbol.trim().toUpperCase()
    if (!sym || sym.length < 2) {
      setDetectedName(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsDetecting(true)
      try {
        const data = await api.fundamentals(sym)
        if (data && data.company_name) {
          setDetectedName(data.company_name)
          const qt = data.quote_type
          if (qt === 'EQUITY') setMarket('Stocks')
          else if (qt === 'ETF' || qt === 'MUTUALFUND' || qt === 'INDEX') setMarket('Funds')
          else if (qt === 'CRYPTOCURRENCY') setMarket('Crypto')
          else if (qt === 'CURRENCY') setMarket('Forex')
        }

        if (ov?.trades) {
          const lastTrade = ov.trades.find(t => t.symbol.toUpperCase() === sym)
          if (lastTrade && lastTrade.strategies) {
            setSelectedStrategyIds(lastTrade.strategies.map(s => s.id))
          }
        }
      } catch (e) {
        // fail silently
      } finally {
        setIsDetecting(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [symbol, ov?.trades])

  const { data: strategies = [] } = useQuery<Strategy[]>({
    queryKey: ['strategies', accountId],
    queryFn: () => api.listStrategies(accountId)
  })

  const createMutation = useMutation({
    mutationFn: (payload: TradeCreate) => api.createTrade(payload, accountId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['overview', accountId] })
      navigate('/trades')
    }
  })

  // Calculations
  const entryPx = parseDecimal(entryPriceStr)
  const exitPx = parseDecimal(exitPriceStr)
  const sizeNum = parseDecimal(sizeStr)
  const hasExitOnCreate = exitPriceStr.trim() !== ''

  // Using standard formula from previous instructions
  const calcEntryFees = entryPx > 0 && sizeNum > 0 ? (entryPx * sizeNum * 0.00125) + 3 : 0
  const calcExitFees = exitPx > 0 && sizeNum > 0 ? (exitPx * sizeNum * 0.00125) + 3 : 0

  const feesNum = isAutoFees ? calcEntryFees : evaluateEquation(feesStr)
  const exitFeesNum = hasExitOnCreate ? calcExitFees : 0

  const requiredCash = (entryPx * sizeNum) + feesNum
  const cashAvailable = Number(ov?.kpis.cash_balance ?? 0)
  const cashOk = cashAvailable >= requiredCash
  const canCreate = symbol.trim() && entryPx > 0 && sizeNum > 0

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Add New Trade</div>
          <div className="pageSubtitle">Record your entry and strategies.</div>
        </div>
        <div className="detailsActions">
          <OverviewSyncBar />
        </div>
      </div>

      <div className="card panel" style={{ marginTop: 20, maxWidth: 800 }}>
        <div className="panelTitle">Trade Details</div>
        
        <div className="formGrid detailsForm" style={{ marginTop: 16 }}>
          <label>
            <div className="label">Symbol</div>
            <input
              type="text"
              autoComplete="off"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., TSLA, AAPL"
            />
            {detectedName && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                ✓ {detectedName} <span style={{ opacity: 0.6, fontWeight: 400 }}>({market})</span>
              </div>
            )}
            {isDetecting && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Validating symbol...</div>}
          </label>

          <label>
            <div className="label">Market</div>
            <select value={market} onChange={(e) => setMarket(e.target.value as Market)}>
              <option value="Stocks">Stocks</option>
              <option value="Funds">Funds</option>
              <option value="Crypto">Crypto</option>
              <option value="Forex">Forex</option>
            </select>
          </label>

          <label>
            <div className="label">Entry Price</div>
            <input
              type="text"
              inputMode="decimal"
              value={entryPriceStr}
              onChange={(e) => setEntryPriceStr(normalizeDecimalTyping(entryPriceStr, e.target.value))}
              placeholder="0.00"
            />
          </label>

          <label>
            <div className="label">Position Size</div>
            <input
              type="text"
              inputMode="decimal"
              value={sizeStr}
              onChange={(e) => setSizeStr(normalizeDecimalTyping(sizeStr, e.target.value))}
              placeholder="0"
            />
          </label>

          <label>
            <div className="label">Exit Price (optional)</div>
            <input
              type="text"
              inputMode="decimal"
              value={exitPriceStr}
              onChange={(e) => setExitPriceStr(normalizeDecimalTyping(exitPriceStr, e.target.value))}
              placeholder="Leave blank to keep open"
            />
          </label>

          <label>
            <div className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Entry Fees</span>
              <span 
                style={{ fontSize: 10, cursor: 'pointer', color: isAutoFees ? 'var(--accent)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => setIsAutoFees(!isAutoFees)}
              >
                <input type="checkbox" checked={isAutoFees} readOnly style={{ width: 10, height: 10 }} /> Auto
              </span>
            </div>
            <input
              type="text"
              value={isAutoFees && feesNum > 0 ? feesNum.toFixed(2) : feesStr}
              onChange={(e) => {
                if (isAutoFees) setIsAutoFees(false)
                setFeesStr(e.target.value)
              }}
              placeholder="0.00"
            />
          </label>

          <label className="span2">
            <div className="label">Strategies</div>
            <StrategySelect 
              allStrategies={strategies}
              selectedIds={selectedStrategyIds}
              onChange={setSelectedStrategyIds}
              onCreate={async (name) => {
                const s = await api.createStrategy({ name }, accountId)
                setSelectedStrategyIds([...selectedStrategyIds, s.id])
              }}
            />
          </label>

          <label>
            <div className="label">Entry Date</div>
            <input type="datetime-local" value={entryDateLocal} onChange={e => setEntryDateLocal(e.target.value)} />
          </label>

          <label>
            <div className="label">Exit Date</div>
            <input 
              type="datetime-local" 
              value={exitDateLocal} 
              onChange={e => setExitDateLocal(e.target.value)} 
              disabled={!hasExitOnCreate}
              style={{ opacity: hasExitOnCreate ? 1 : 0.5 }}
            />
          </label>

          <label className="span2">
            <div className="label">Notes</div>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Trade rationale, emotions, lessons..."
            />
          </label>

          <div className="detailsActions span2" style={{ gridColumn: '1 / -1', marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                Estimated Cost: <span className="mono" style={{ color: 'var(--text-strong)' }}>{formatCurrency(requiredCash)}</span>
                {!cashOk && !hasExitOnCreate && <span className="error" style={{ marginLeft: 8 }}>(Insufficient Cash)</span>}
              </div>
            </div>
            <button 
              className="btn btnGhost" 
              onClick={() => navigate('/trades')}
            >
              Cancel
            </button>
            <button 
              className="btn" 
              disabled={!canCreate || (!cashOk && !hasExitOnCreate) || createMutation.isPending}
              onClick={() => {
                createMutation.mutate({
                  symbol: symbol.trim().toUpperCase(),
                  market,
                  entry_price: entryPx,
                  exit_price: hasExitOnCreate ? parseDecimal(exitPriceStr) : null,
                  stop_loss: null,
                  take_profit: null,
                  position_size: sizeNum,
                  strategy_used: null,
                  strategy_ids: selectedStrategyIds,
                  indicators_used: null,
                  entry_date: new Date(entryDateLocal).toISOString(),
                  exit_date: hasExitOnCreate ? new Date(exitDateLocal || defaultEntry).toISOString() : null,
                  fees: feesNum,
                  exit_fees: exitFeesNum,
                  notes: notes.trim() || null,
                  lessons_learned: null,
                })
              }}
            >
              {createMutation.isPending ? 'Saving...' : 'Add Trade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

