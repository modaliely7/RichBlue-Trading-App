import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { api, tradeScreenshotPublicUrl, type OverviewResponse } from '../lib/api'
import type { Market, Trade, TradeUpdate } from '../lib/api'
import { formatCurrency, formatDuration, formatPct } from '../lib/format'
import { useAccount } from '../components/AccountContext'
import { StrategySelect } from '../components/StrategySelect'





function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Allows typing decimals without awkward leading zeros (e.g. 0100 → 100). */
function normalizeDecimalTyping(prev: string, raw: string): string {
  if (raw === '') return ''
  if (!/^-?\d*\.?\d*$/.test(raw)) return prev
  return raw.replace(/^(-?)0+(?=\d)/, '$1')
}

function parseDecimal(s: string): number {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** 
 * Safely evaluates simple math expressions for fees.
 * Supports: digits, ., +, -, *, /, %, (, )
 * Example: "(100 * 50 * 0.125%) + 3"
 */
function evaluateEquation(eq: string): number {
  if (!eq.trim()) return 0
  try {
    // 1. Replace percentages: 0.125% -> (0.125/100)
    let sanitized = eq.replace(/(\d*\.?\d+)%/g, '($1/100)')

    // 2. Remove anything that isn't a safe math char
    sanitized = sanitized.replace(/[^0-9.\+\-\*\/\(\)\s]/g, '')

    // 3. Eval (simple enough for this use case, and sanitized)
    // eslint-disable-next-line no-eval
    const result = eval(sanitized)
    return Number.isFinite(result) ? result : 0
  } catch {
    return 0
  }
}

function getTradeStyle(entryDate: string, exitDate: string | null): string {
  const start = new Date(entryDate).getTime()
  const end = exitDate ? new Date(exitDate).getTime() : Date.now()
  const diffDays = (end - start) / (1000 * 60 * 60 * 24)
  if (diffDays <= 30) return 'Swing'
  return 'Long Term'
}

type TradeDraft = {
  symbol: string
  market: Market
  entry_price: string
  exit_price: string
  position_size: string
  fees: string
  exit_fees: string
  strategy_used: string
  entry_date: string
  exit_date: string
  notes: string
  strategy_ids: number[]
  indicators_used: string
  lessons_learned: string
}

function tradeToDraft(t: Trade): TradeDraft {
  return {
    symbol: t.symbol,
    market: t.market,
    entry_price: t.entry_price === 0 ? '' : String(t.entry_price),
    exit_price: t.exit_price == null ? '' : String(t.exit_price),
    position_size: t.position_size === 0 ? '' : String(t.position_size),
    fees: t.fees === 0 ? '' : String(t.fees),
    exit_fees: (t.exit_fees ?? 0) === 0 ? '' : String(t.exit_fees ?? 0),
    strategy_used: t.strategy_used ?? '',
    entry_date: toDatetimeLocalValue(t.entry_date),
    exit_date: t.exit_date ? toDatetimeLocalValue(t.exit_date) : '',
    notes: t.notes || '',
    strategy_ids: (t.strategies || []).map(s => s.id),
    indicators_used: t.indicators_used || '',
    lessons_learned: t.lessons_learned || ''
  }
}



function DividendModal({
  onClose,
  accountId,
  trades
}: {
  onClose: () => void;
  accountId: number;
  trades: Trade[]
}) {
  const [tradeId, setTradeId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [isStockDividend, setIsStockDividend] = useState(false)
  const [note, setNote] = useState('')
  const [at, setAt] = useState(() => {
    const dt = new Date()
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const qc = useQueryClient()

  const openTrades = trades.filter(t => !t.exit_price)

  const mutation = useMutation({
    mutationFn: (payload: any) => api.recordTradeDividend(payload.trade_id, payload),
    onSuccess: () => {
      Promise.all([
        qc.invalidateQueries({ queryKey: ['overview', accountId] }),
        qc.invalidateQueries({ queryKey: ['cashBalance', accountId] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions', accountId] })
      ])
      onClose()
    }
  })

  const selectedTrade = trades.find(t => t.id === tradeId)

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="card panel" onClick={e => e.stopPropagation()} style={{ width: 450, maxWidth: '90%', border: '1px solid var(--accent-dim)' }}>
        <div className="panelTitle">Record Dividend</div>
        <div className="muted">Link a dividend payment or stock bonus to an open trade.</div>
        <div className="formGrid">
          <label className="span2">
            <div className="label">Linked Trade (Open Only)</div>
            <select value={tradeId || ''} onChange={e => setTradeId(Number(e.target.value))}>
              <option value="">Select a trade...</option>
              {openTrades.map(t => (
                <option key={t.id} value={t.id}>{t.symbol} - Entry: {formatCurrency(t.entry_price)} (Size: {t.position_size})</option>
              ))}
            </select>
          </label>
          <label>
            <div className="label">Type</div>
            <select value={isStockDividend ? 'stock' : 'cash'} onChange={e => setIsStockDividend(e.target.value === 'stock')}>
              <option value="cash">Cash Dividend</option>
              <option value="stock">Stock Dividend (Shares)</option>
            </select>
          </label>
          <label>
            <div className="label">{isStockDividend ? 'Shares Added' : 'Dividend Amount'}</div>
            <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(normalizeDecimalTyping(amount, e.target.value))} placeholder="0.00" />
          </label>
          <label className="span2">
            <div className="label">Date</div>
            <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} />
          </label>
          <label className="span2">
            <div className="label">Note</div>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional description" />
          </label>
          <div className="detailsActions span2" style={{ justifyContent: 'flex-end' }}>
            <button className="btnGhost" onClick={onClose}>Cancel</button>
            <button className="btn" disabled={!tradeId || !amount || mutation.isPending} onClick={() => {
              mutation.mutate({
                symbol: selectedTrade?.symbol || '',
                amount: parseDecimal(amount),
                is_stock_dividend: isStockDividend,
                trade_id: tradeId,
                at: new Date(at).toISOString(),
                note: note
              })
            }}>
              {mutation.isPending ? 'Saving...' : 'Save Dividend'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function JournalPage() {
  const { currentAccount } = useAccount()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const accountId = currentAccount?.id ?? 1

  const { data: ov, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ['overview', accountId],
    queryFn: () => api.overview(accountId)
  })

  const { data: allStrategies = [], refetch: refetchStrategies } = useQuery({
    queryKey: ['strategies', accountId],
    queryFn: () => api.listStrategies(accountId)
  })

  const [tradeSearch, setTradeSearch] = useState<string>('')
  const [tradeStatus, setTradeStatus] = useState<'all' | 'open' | 'closed'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isDividendModalOpen, setIsDividendModalOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<TradeDraft | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [isAutoFeesEdit, setIsAutoFeesEdit] = useState(true)

  const createStrategyForEditMutation = useMutation({
    mutationFn: (name: string) => api.createStrategy({ name }, accountId),
    onSuccess: (newSt) => {
      refetchStrategies()
      if (draft) {
        setDraft({ ...draft, strategy_ids: [...draft.strategy_ids, newSt.id] })
      }
    }
  })

  useEffect(() => {
    if (!isAutoFeesEdit || !draft) return
    const xp = parseDecimal(draft.exit_price)
    const sz = parseDecimal(draft.position_size)
    if (xp > 0 && sz > 0) {
      const calcStr = `(${xp} * ${sz} * 0.125 / 100) + 3`
      if (draft.exit_fees !== calcStr) {
        setDraft({ ...draft, exit_fees: calcStr })
      }
    } else if (draft.exit_fees !== '' && draft.exit_fees.includes('0.125 / 100')) {
      setDraft({ ...draft, exit_fees: '' })
    }
  }, [isAutoFeesEdit, draft?.exit_price, draft?.position_size])

  const selectedTrade = useMemo<Trade | null>(() => {
    if (selectedId == null) return null
    return (ov?.trades ?? []).find((t) => t.id === selectedId) ?? null
  }, [ov, selectedId])

  useEffect(() => {
    setEditMode(false)
    setDraft(null)
  }, [selectedId])

  useEffect(() => {
    if (!lightboxUrl) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxUrl(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxUrl])

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TradeUpdate }) => api.updateTrade(id, payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['overview', accountId] }),
        qc.invalidateQueries({ queryKey: ['cashBalance', accountId] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions', accountId] }),
      ])
      setEditMode(false)
      setDraft(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTrade(id),
    onSuccess: async (_data, deletedId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['overview', accountId] }),
        qc.invalidateQueries({ queryKey: ['cashBalance', accountId] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions', accountId] }),
      ])
      setSelectedId((cur) => (cur === deletedId ? null : cur))
    },
  })

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => api.uploadScreenshot(id, file),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['overview', accountId] })
    },
  })

  const deleteScreenshotMutation = useMutation({
    mutationFn: (id: number) => api.deleteTradeScreenshot(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['overview', accountId] })
    },
  })

  const rows = useMemo(() => {
    const q = tradeSearch.trim().toUpperCase()
    return (ov?.trades ?? [])
      .filter((t) => {
        if (tradeStatus === 'open' && t.exit_price != null) return false
        if (tradeStatus === 'closed' && t.exit_price == null) return false
        if (q) {
          const symMatch = t.symbol.toUpperCase().includes(q)
          const strategyMatch = t.strategies?.some(s => s.name.toUpperCase().includes(q))
          return symMatch || strategyMatch
        }
        return true
      })
      .sort((a, b) => {
        const aOpen = a.exit_price == null ? 1 : 0
        const bOpen = b.exit_price == null ? 1 : 0
        if (aOpen !== bOpen) return bOpen - aOpen
        return new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
      })
  }, [ov, tradeSearch, tradeStatus])

  const totalBought = useMemo(() => rows.reduce((acc, t) => acc + (t.entry_price * t.position_size), 0), [rows])
  const totalSold = useMemo(() => rows.reduce((acc, t) => acc + (t.exit_price != null ? t.exit_price * t.position_size : 0), 0), [rows])

  const beginEdit = () => {
    if (!selectedTrade) return
    setDraft(tradeToDraft(selectedTrade))
    setEditMode(true)
  }

  const saveDraft = () => {
    if (!selectedTrade || !draft) return
    const ep = parseDecimal(draft.entry_price)
    const sz = parseDecimal(draft.position_size)
    if (!draft.symbol.trim() || !Number.isFinite(ep) || !Number.isFinite(sz)) return
    updateMutation.mutate({
      id: selectedTrade.id,
      payload: {
        symbol: draft.symbol.trim().toUpperCase(),
        market: draft.market,
        entry_price: ep,
        exit_price: draft.exit_price.trim() === '' ? null : parseDecimal(draft.exit_price),
        position_size: sz,
        fees: evaluateEquation(draft.fees),
        exit_fees: evaluateEquation(draft.exit_fees),
        strategy_ids: draft.strategy_ids,
        indicators_used: draft.indicators_used.trim() || null,
        entry_date: new Date(draft.entry_date).toISOString(),
        exit_date: draft.exit_date.trim() ? new Date(draft.exit_date).toISOString() : null,
        notes: draft.notes.trim() || null,
        lessons_learned: draft.lessons_learned.trim() || null,
      },
    })
  }

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Trade Journal</div>
          <div className="pageSubtitle">Review your trade history and analyze performance.</div>
        </div>
        <div className="detailsActions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 12 }}>
          <button className="btn btnPrimary" onClick={() => navigate('/trades/add')}>+ Add New Trade</button>
          <button className="btn btnGhost" onClick={() => setIsDividendModalOpen(true)}>Record Dividend</button>
          <OverviewSyncBar />
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span className="muted">Filter by Strategy:</span>
        <span 
          className={`statusPill ${!tradeSearch ? 'status-ok' : ''}`} 
          style={{ cursor: 'pointer', opacity: !tradeSearch ? 1 : 0.6 }}
          onClick={() => setTradeSearch('')}
        >
          All
        </span>
        {Array.from(new Map(allStrategies.map(s => [s.name.toUpperCase(), s])).values()).map(s => (
          <span 
            key={s.id} 
            className={`statusPill ${tradeSearch.toUpperCase() === s.name.toUpperCase() ? 'status-ok' : ''}`}
            style={{ 
              cursor: 'pointer', 
              background: tradeSearch.toUpperCase() === s.name.toUpperCase() ? (s.color || 'var(--accent)') : 'var(--bg)',
              opacity: !tradeSearch || tradeSearch.toUpperCase() === s.name.toUpperCase() ? 1 : 0.6
            }}
            onClick={() => setTradeSearch(s.name)}
          >
            {s.name}
          </span>
        ))}
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load trades. Start the API server.</div> : null}

      <div className="tradeSplit">
        <div className="card panel" style={{ minWidth: 0 }}>
          <div className="panelTitleRow">
            <div className="panelTitle">Trades</div>
            <div className="detailsActions" style={{ justifyContent: 'flex-end' }}>
              <div className="muted">
                Bought: {formatCurrency(totalBought)} | Sold: {formatCurrency(totalSold)}
              </div>
              <input className="miniInput" style={{ width: 180 }} value={tradeSearch} onChange={(e) => setTradeSearch(e.target.value)} placeholder="Search symbol…" />
              <select className="miniInput" style={{ width: 150 }} value={tradeStatus} onChange={(e) => setTradeStatus(e.target.value as 'all' | 'open' | 'closed')}>
                <option value="all">All trades</option>
                <option value="open">Open only</option>
                <option value="closed">Closed only</option>
              </select>
            </div>
          </div>
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Symbol</th>
                  <th>Market</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Size</th>
                  <th>Fees</th>
                  <th>PnL</th>
                  <th>Return</th>
                  <th>Strategies</th>
                  <th>Style</th>
                  <th>Duration</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={selectedId === t.id ? 'rowSelected' : ''} onClick={() => setSelectedId(t.id)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{t.exit_price == null ? 'OPEN' : 'CLOSED'}</td>
                    <td className="mono">{t.symbol}</td>
                    <td>{t.market}</td>
                    <td>{t.entry_price}</td>
                    <td>{t.exit_price ?? '—'}</td>
                    <td>{t.position_size}</td>
                    <td>{formatCurrency((t.fees ?? 0) + (t.exit_fees ?? 0))}</td>
                    <td className={t.pnl != null && t.pnl >= 0 ? 'good' : 'bad'}>{t.pnl == null ? '—' : formatCurrency(t.pnl)}</td>
                    <td>{t.return_pct == null ? '—' : formatPct(t.return_pct)}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {t.strategies?.map(s => (
                          <span
                            key={s.id}
                            className="statusPill clickableTag"
                            onClick={(e) => {
                              e.stopPropagation()
                              setTradeSearch(s.name)
                            }}
                            style={{ background: s.color || 'var(--accent-dim)', color: 'var(--text-strong)', border: 'none', fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
                          >
                            {s.name}
                          </span>
                        ))}
                        {(!t.strategies || t.strategies.length === 0) && <span className="muted">—</span>}
                      </div>
                    </td>
                    <td>{getTradeStyle(t.entry_date, t.exit_price != null ? (t.exit_date || new Date().toISOString()) : null)}</td>
                    <td>{formatDuration(t.duration_seconds)}</td>
                    <td>
                      <button
                        className="btn btnGhost"
                        disabled={deleteMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Delete trade #${t.id} (${t.symbol})?`)) deleteMutation.mutate(t.id)
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="muted">
                      No trades yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card panel" style={{ minWidth: 0 }}>
          <div className="panelTitle">Trade details & actions</div>
          {selectedTrade ? (
            <>
              {!editMode || !draft ? (
                <>
                  <div className="detailsLine">
                    <span className="muted">Symbol:</span> <span className="mono">{selectedTrade.symbol}</span>
                  </div>
                  <div className="detailsLine">
                    <span className="muted">Status:</span> <span className="mono">{selectedTrade.exit_price == null ? 'OPEN' : 'CLOSED'}</span>
                  </div>
                  <div className="detailsLine">
                    <span className="muted">PnL:</span>{' '}
                    <span className={selectedTrade.pnl != null && selectedTrade.pnl >= 0 ? 'good' : 'bad'}>
                      {selectedTrade.pnl == null ? '—' : formatCurrency(selectedTrade.pnl)}
                    </span>
                  </div>
                  <div className="detailsLine">
                    <span className="muted">Return:</span>{' '}
                    <span>{selectedTrade.return_pct == null ? '—' : formatPct(selectedTrade.return_pct)}</span>
                  </div>
                  <div className="detailsLine">
                    <span className="muted">Trade Style:</span>{' '}
                    <span className="mono">{getTradeStyle(selectedTrade.entry_date, selectedTrade.exit_price != null ? (selectedTrade.exit_date || new Date().toISOString()) : null)}</span>
                  </div>
                  <div className="detailsLine">
                    <span className="muted">Total Bought:</span> <span className="mono">{formatCurrency(selectedTrade.entry_price * selectedTrade.position_size)}</span>
                  </div>
                  {selectedTrade.exit_price != null && (
                    <div className="detailsLine">
                      <span className="muted">Total Sold:</span> <span className="mono">{formatCurrency(selectedTrade.exit_price * selectedTrade.position_size)}</span>
                    </div>
                  )}
                  <div className="detailsLine">
                    <span className="muted">Entry fees:</span> <span className="mono">{formatCurrency(selectedTrade.fees ?? 0)}</span>
                  </div>
                  <div className="detailsLine">
                    <span className="muted">Exit fees:</span>{' '}
                    <span className="mono">{formatCurrency(selectedTrade.exit_fees ?? 0)}</span>
                  </div>
                  <div className="detailsLine" style={{ borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 4 }}>
                    <span className="muted">Total fees:</span>{' '}
                    <span className="mono">{formatCurrency((selectedTrade.fees ?? 0) + (selectedTrade.exit_fees ?? 0))}</span>
                  </div>

                  <div className="detailsActions">
                    <button type="button" className="btn" onClick={beginEdit}>
                      Edit trade
                    </button>
                    <label className="fileBtn">
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          uploadMutation.mutate({ id: selectedTrade.id, file: f })
                          e.currentTarget.value = ''
                        }}
                      />
                      {uploadMutation.isPending ? 'Uploading…' : 'Upload Screenshot'}
                    </label>
                    <button
                      className="btn btnGhost"
                      disabled={selectedTrade.exit_price == null}
                      onClick={() =>
                        updateMutation.mutate({ id: selectedTrade.id, payload: { exit_price: null, exit_date: null, exit_fees: 0 } })
                      }
                    >
                      Re-open
                    </button>
                  </div>
                </>
              ) : (
                <div className="formGrid detailsForm">
                  <label>
                    <div className="label">Symbol</div>
                    <input value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })} />
                  </label>
                  <label>
                    <div className="label">Market</div>
                    <select value={draft.market} onChange={(e) => setDraft({ ...draft, market: e.target.value as Market })}>
                      <option value="Stocks">Stocks</option>
                      <option value="Funds">Funds</option>
                      <option value="Crypto">Crypto</option>
                      <option value="Forex">Forex</option>
                    </select>
                  </label>
                  <label>
                    <div className="label">Entry price</div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.entry_price}
                      onChange={(e) => setDraft({ ...draft, entry_price: normalizeDecimalTyping(draft.entry_price, e.target.value) })}
                    />
                  </label>
                  <label>
                    <div className="label">Exit price</div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.exit_price}
                      onChange={(e) => setDraft({ ...draft, exit_price: normalizeDecimalTyping(draft.exit_price, e.target.value) })}
                      placeholder="Open"
                    />
                  </label>
                  <label>
                    <div className="label">Size</div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.position_size}
                      onChange={(e) => setDraft({ ...draft, position_size: normalizeDecimalTyping(draft.position_size, e.target.value) })}
                    />
                  </label>
                  <label>
                    <div className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Fees (entry)</span>
                      {evaluateEquation(draft.fees) > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>= {formatCurrency(evaluateEquation(draft.fees))}</span>}
                    </div>
                    <input
                      type="text"
                      value={draft.fees}
                      onChange={(e) => setDraft({ ...draft, fees: e.target.value })}
                    />
                  </label>
                  <label>
                    <div className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>Exit fees</span>
                        <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', color: isAutoFeesEdit ? 'var(--accent)' : 'var(--muted)' }} onClick={() => setIsAutoFeesEdit(!isAutoFeesEdit)}>
                          <input type="checkbox" checked={isAutoFeesEdit} onChange={() => { }} style={{ width: 10, height: 10 }} /> Auto
                        </span>
                      </div>
                      {evaluateEquation(draft.exit_fees) > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>= {formatCurrency(evaluateEquation(draft.exit_fees))}</span>}
                    </div>
                    <input
                      type="text"
                      value={draft.exit_fees}
                      onChange={(e) => {
                        if (isAutoFeesEdit) setIsAutoFeesEdit(false)
                        setDraft({ ...draft, exit_fees: e.target.value })
                      }}
                      placeholder="0"
                    />
                  </label>
                  <label className="span2">
                    <div className="label">Indicators Used</div>
                    <input value={draft.indicators_used} onChange={(e) => setDraft({ ...draft, indicators_used: e.target.value })} placeholder="e.g. RSI, VWAP" />
                  </label>
                  <label className="span2">
                    <div className="label">Strategies</div>
                    <StrategySelect
                      selectedIds={draft.strategy_ids}
                      allStrategies={allStrategies}
                      onChange={(ids) => setDraft({ ...draft, strategy_ids: ids })}
                      onCreate={async (name) => { createStrategyForEditMutation.mutate(name) }}
                    />
                  </label>
                  <label className="span2">
                    <div className="label">Entry date</div>
                    <input type="datetime-local" value={draft.entry_date} onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })} />
                  </label>
                  <label className="span2">
                    <div className="label">Exit date</div>
                    <input type="datetime-local" value={draft.exit_date} onChange={(e) => setDraft({ ...draft, exit_date: e.target.value })} />
                  </label>
                  <label className="span2">
                    <div className="label">Notes</div>
                    <textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                  </label>
                  <label className="span2">
                    <div className="label">Lessons Learned</div>
                    <textarea rows={2} value={draft.lessons_learned} onChange={(e) => setDraft({ ...draft, lessons_learned: e.target.value })} />
                  </label>
                  <div className="detailsActions span2" style={{ gridColumn: '1 / -1' }}>
                    <button type="button" className="btn" disabled={updateMutation.isPending} onClick={saveDraft}>
                      Save changes
                    </button>
                    <button
                      type="button"
                      className="btn btnGhost"
                      onClick={() => {
                        setEditMode(false)
                        setDraft(null)
                      }}
                    >
                      Cancel
                    </button>
                    <label className="fileBtn">
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f || !selectedTrade) return
                          uploadMutation.mutate({ id: selectedTrade.id, file: f })
                          e.currentTarget.value = ''
                        }}
                      />
                      {uploadMutation.isPending ? 'Uploading…' : 'Screenshot'}
                    </label>
                  </div>
                </div>
              )}

              {selectedTrade.screenshot_path ? (
                <div>
                  <div className="label">
                    Screenshot
                  </div>
                  <div className="detailsActions" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <button
                      type="button"
                      className="btn btnGhost"
                      style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onClick={() => {
                        const u = tradeScreenshotPublicUrl(selectedTrade.screenshot_path)
                        if (u) setLightboxUrl(u)
                      }}
                      title="View full size"
                    >
                      <img
                        src={tradeScreenshotPublicUrl(selectedTrade.screenshot_path) ?? undefined}
                        alt=""
                        style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, display: 'block', border: '1px solid rgba(148,163,184,0.25)' }}
                      />
                    </button>
                    <button
                      type="button"
                      className="btn btnGhost"
                      disabled={deleteScreenshotMutation.isPending}
                      onClick={() => {
                        if (confirm('Remove this screenshot?')) deleteScreenshotMutation.mutate(selectedTrade.id)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : null}

              {uploadMutation.error || updateMutation.error ? <div className="error">Failed to update trade.</div> : null}
            </>
          ) : (
            <div className="muted">Click a trade row to see details and edit/close/re-open.</div>
          )}
        </div>
      </div>

      {lightboxUrl ? (
        <div
          role="presentation"
          className="lightboxOverlay"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Screenshot"
            className="lightboxImage"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      {isDividendModalOpen && (
        <DividendModal
          onClose={() => setIsDividendModalOpen(false)}
          accountId={currentAccount?.id ?? 1}
          trades={ov?.trades ?? []}
        />
      )}
    </div>
  )
}
