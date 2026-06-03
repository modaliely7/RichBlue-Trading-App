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
  const [stopLossStr, setStopLossStr] = useState('')
  const [takeProfitStr, setTakeProfitStr] = useState('')
  const [slPctStr, setSlPctStr] = useState('')
  const [tpPctStr, setTpPctStr] = useState('')
  const [riskPctOfAccount, setRiskPctOfAccount] = useState('1') // Default 1%
  const [indicatorsUsed, setIndicatorsUsed] = useState('')
  const [lessonsLearned, setLessonsLearned] = useState('')
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

  // Sync SL % when Price changes
  useEffect(() => {
    const ep = parseDecimal(entryPriceStr)
    const sl = parseDecimal(stopLossStr)
    if (ep > 0 && sl > 0) {
      const pct = ((sl - ep) / ep) * 100
      setSlPctStr(pct.toFixed(2))
    }
  }, [entryPriceStr, stopLossStr])

  // Handlers for percentage changes
  const handleSlPctChange = (val: string) => {
    const raw = normalizeDecimalTyping(slPctStr, val)
    setSlPctStr(raw)
    const pct = parseDecimal(raw)
    const ep = parseDecimal(entryPriceStr)
    if (ep > 0 && pct !== 0) {
      const sl = ep * (1 + pct / 100)
      setStopLossStr(sl.toFixed(2))
    }
  }

  const handleTpPctChange = (val: string) => {
    const raw = normalizeDecimalTyping(tpPctStr, val)
    setTpPctStr(raw)
    const pct = parseDecimal(raw)
    const ep = parseDecimal(entryPriceStr)
    if (ep > 0 && pct !== 0) {
      const tp = ep * (1 + pct / 100)
      setTakeProfitStr(tp.toFixed(2))
    }
  }

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
  const slPx = parseDecimal(stopLossStr)
  const tpPx = parseDecimal(takeProfitStr)
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

  // Risk Management Calculations
  const riskPerShare = entryPx > 0 && slPx > 0 ? Math.abs(entryPx - slPx) : 0
  const rewardPerShare = entryPx > 0 && tpPx > 0 ? Math.abs(tpPx - entryPx) : 0
  const totalRisk = riskPerShare * sizeNum
  const totalReward = rewardPerShare * sizeNum
  const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0

  // Position Sizing Recommendation
  const accountRiskVal = parseDecimal(riskPctOfAccount)
  const recommendedSize = (riskPerShare > 0 && accountRiskVal > 0) 
    ? Math.floor((cashAvailable * (accountRiskVal / 100)) / riskPerShare)
    : 0

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, marginTop: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Main Details */}
          <div className="card panel">
            <div className="panelTitle">Trade Configuration</div>
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
                <div className="label">Indicators Used</div>
                <input 
                  type="text" 
                  value={indicatorsUsed} 
                  onChange={e => setIndicatorsUsed(e.target.value)}
                  placeholder="e.g. RSI, EMA 200, VWAP"
                />
              </label>

              <label className="span2">
                <div className="label">Notes</div>
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Entry reason, setup details..." />
              </label>

              <label className="span2">
                <div className="label">Lessons Learned (Post-Trade)</div>
                <textarea rows={2} value={lessonsLearned} onChange={(e) => setLessonsLearned(e.target.value)} placeholder="What went well? What to avoid?" />
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Risk Management Side Panel */}
          <div className="card panel" style={{ borderLeft: '4px solid var(--accent)' }}>
            <div className="panelTitle">🛡️ Risk Management</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
                <label>
                  <div className="label">Stop Loss (Price)</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={stopLossStr}
                    onChange={(e) => setStopLossStr(normalizeDecimalTyping(stopLossStr, e.target.value))}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  <div className="label">SL %</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slPctStr}
                    onChange={(e) => handleSlPctChange(e.target.value)}
                    placeholder="%"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
                <label>
                  <div className="label">Take Profit (Price)</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={takeProfitStr}
                    onChange={(e) => setTakeProfitStr(normalizeDecimalTyping(takeProfitStr, e.target.value))}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  <div className="label">TP %</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tpPctStr}
                    onChange={(e) => handleTpPctChange(e.target.value)}
                    placeholder="%"
                  />
                </label>
              </div>

              <div className="metricGrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                <div className="metricCard" style={{ background: 'var(--panel2)', padding: 12, borderRadius: 8 }}>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Risk Amount</div>
                  <div style={{ color: 'var(--danger)', fontWeight: 800, fontSize: 16 }}>{formatCurrency(totalRisk)}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{slPctStr}% move</div>
                </div>
                <div className="metricCard" style={{ background: 'var(--panel2)', padding: 12, borderRadius: 8 }}>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Target Profit</div>
                  <div style={{ color: 'var(--accent2)', fontWeight: 800, fontSize: 16 }}>{formatCurrency(totalReward)}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{tpPctStr}% move</div>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div className="panelTitle" style={{ fontSize: 12, marginBottom: 12 }}>📏 Position Sizing Helper</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ flex: 1 }}>
                    <div className="label">Risk % of Account</div>
                    <input 
                      type="text" 
                      value={riskPctOfAccount} 
                      onChange={e => setRiskPctOfAccount(normalizeDecimalTyping(riskPctOfAccount, e.target.value))}
                      style={{ height: 36 }}
                    />
                  </label>
                  <div style={{ flex: 1.5, textAlign: 'right' }}>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 700 }}>RECOMMENDED SIZE</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{recommendedSize} <span style={{ fontSize: 12, fontWeight: 500 }}>shares</span></div>
                    <button 
                      className="btnGhost" 
                      style={{ fontSize: 10, padding: '2px 8px', height: 'auto', marginTop: 4 }}
                      onClick={() => setSizeStr(String(recommendedSize))}
                      disabled={recommendedSize <= 0}
                    >
                      Apply to Size
                    </button>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  Based on current cash: <strong>{formatCurrency(cashAvailable)}</strong>
                </div>
              </div>

              <div style={{ 
                background: rrRatio >= 2 ? 'var(--accent2-dim)' : 'var(--panel2)', 
                padding: '12px 16px', 
                borderRadius: 10, 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                border: rrRatio >= 2 ? '1px solid var(--accent2)' : '1px solid var(--border)'
              }}>
                <div>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>R/R Ratio</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: rrRatio >= 2 ? 'var(--accent2)' : 'var(--text-strong)' }}>
                    {rrRatio.toFixed(2)}
                  </div>
                </div>
                {rrRatio >= 2 && <div style={{ fontSize: 24 }}>🚀</div>}
              </div>
            </div>
          </div>

          <div className="card panel">
            <div className="panelTitle">Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Total Value</span>
                <span className="mono">{(entryPx * sizeNum).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Total Fees</span>
                <span className="mono">{feesNum.toLocaleString()}</span>
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
                <span>Required Cash</span>
                <span className="mono" style={{ color: 'var(--text-strong)' }}>{formatCurrency(requiredCash)}</span>
              </div>
              {!cashOk && !hasExitOnCreate && (
                <div className="error" style={{ fontSize: 12, textAlign: 'right', marginTop: -4 }}>
                  ⚠️ Insufficient cash in account
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              <button 
                className="btn" 
                style={{ width: '100%', height: 44, fontSize: 15 }}
                disabled={!canCreate || (!cashOk && !hasExitOnCreate) || createMutation.isPending}
                onClick={() => {
                  createMutation.mutate({
                    symbol: symbol.trim().toUpperCase(),
                    market,
                    entry_price: entryPx,
                    exit_price: hasExitOnCreate ? parseDecimal(exitPriceStr) : null,
                    stop_loss: slPx || null,
                    take_profit: tpPx || null,
                    position_size: sizeNum,
                    strategy_used: null,
                    strategy_ids: selectedStrategyIds,
                    indicators_used: indicatorsUsed.trim() || null,
                    entry_date: new Date(entryDateLocal).toISOString(),
                    exit_date: hasExitOnCreate ? new Date(exitDateLocal || defaultEntry).toISOString() : null,
                    fees: feesNum,
                    exit_fees: exitFeesNum,
                    notes: notes.trim() || null,
                    lessons_learned: lessonsLearned.trim() || null,
                  })
                }}
              >
                {createMutation.isPending ? 'Saving...' : 'Confirm Trade'}
              </button>
              <button 
                className="btn btnGhost" 
                style={{ width: '100%' }}
                onClick={() => navigate('/trades')}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

