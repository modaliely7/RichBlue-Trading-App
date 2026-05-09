import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { api, tradeScreenshotPublicUrl, type OverviewResponse, type Strategy } from '../lib/api'
import type { Market, Trade, TradeCreate, TradeUpdate } from '../lib/api'
import { formatCurrency, formatDuration, formatPct } from '../lib/format'
import { useAccount } from '../components/AccountContext'

const SYMBOLS_KEY = 'tradingJournal.savedSymbols.v1'

function loadSavedSymbols(): string[] {
  try {
    const raw = localStorage.getItem(SYMBOLS_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(arr)) return []
    return arr.filter((x) => typeof x === 'string').map((s) => s.toUpperCase())
  } catch {
    return []
  }
}

function saveSymbol(symbol: string) {
  const s = symbol.trim().toUpperCase()
  if (!s) return
  const cur = loadSavedSymbols()
  const next = [s, ...cur.filter((x) => x !== s)].slice(0, 50)
  localStorage.setItem(SYMBOLS_KEY, JSON.stringify(next))
}

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
    strategy_ids: (t.strategies || []).map(s => s.id)
  }
}

function StrategySelect({
  selectedIds,
  onChange,
  allStrategies,
  onCreate
}: {
  selectedIds: number[],
  onChange: (ids: number[]) => void,
  allStrategies: Strategy[],
  onCreate: (name: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const filtered = allStrategies.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
  const selected = allStrategies.filter(s => selectedIds.includes(s.id))

  return (
    <div className="strategySelect" style={{ position: 'relative' }}>
      <div className="tagList" onClick={() => setIsOpen(!isOpen)} style={{ minHeight: 42, padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: 4, cursor: 'text' }}>
        {selected.map(s => (
          <span key={s.id} className="statusPill" style={{ background: s.color || 'var(--accent-dim)', display: 'flex', alignItems: 'center', gap: 6, border: 'none', color: 'var(--text-strong)' }}>
            {s.name}
            <span onClick={(e) => { e.stopPropagation(); onChange(selectedIds.filter(id => id !== s.id)) }} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 14 }}>×</span>
          </span>
        ))}
        <input
          placeholder={selectedIds.length === 0 ? "Select strategies..." : ""}
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true) }}
          onFocus={() => setIsOpen(true)}
          style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, minWidth: 80, color: 'inherit', padding: '4px 0' }}
        />
      </div>
      {isOpen && (
        <div className="strategyDropdown card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', background: 'var(--panel)' }}>
          {filtered.map(s => (
            <div
              key={s.id}
              className="strategyOption"
              onClick={() => {
                if (!selectedIds.includes(s.id)) onChange([...selectedIds, s.id])
                setQuery('')
                setIsOpen(false)
              }}
              style={{ padding: '10px 12px', cursor: 'pointer', background: selectedIds.includes(s.id) ? 'var(--accent-dim)' : 'transparent' }}
            >
              {s.name}
            </div>
          ))}
          {query && !allStrategies.some(s => s.name.toLowerCase() === query.toLowerCase()) && (
            <div
              className="strategyOption"
              style={{ padding: '10px 12px', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}
              onClick={async () => {
                await onCreate(query)
                setQuery('')
              }}
            >
              + Add "{query}"
            </div>
          )}
          {filtered.length === 0 && !query && <div style={{ padding: 12, fontSize: 12, color: 'var(--muted2)' }}>No strategies found. Start typing to add one.</div>}
        </div>
      )}
    </div>
  )
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
    mutationFn: (payload: any) => api.recordDividend({ ...payload, account_id: accountId }),
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
    <div className="modalOverlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
      <div className="card panel" onClick={e => e.stopPropagation()} style={{ width: 450, maxWidth: '90%', border: '1px solid var(--accent-dim)' }}>
        <div className="panelTitle">Record Dividend</div>
        <div className="muted" style={{ marginBottom: 16, fontSize: 13 }}>Link a dividend payment or stock bonus to an open trade.</div>
        <div className="formGrid" style={{ marginTop: 12 }}>
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
          <div className="detailsActions span2" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
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
  const { data: ov, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ['overview', currentAccount?.id],
    queryFn: () => api.overview(currentAccount?.id ?? 1)
  })
  const now = useMemo(() => new Date(), [])
  const defaultEntry = useMemo(() => toDatetimeLocalValue(now.toISOString()), [now])

  const [symbol, setSymbol] = useState('')
  const [market, setMarket] = useState<Market>('Stocks')
  const [entryPriceStr, setEntryPriceStr] = useState('')
  const [exitPriceStr, setExitPriceStr] = useState('')
  const [sizeStr, setSizeStr] = useState('')
  const [entryDateLocal, setEntryDateLocal] = useState<string>(defaultEntry)
  const [exitDateLocal, setExitDateLocal] = useState<string>('')
  const [feesStr, setFeesStr] = useState('')
  const [exitFeesStr, setExitFeesStr] = useState('')
  const [isAutoFees, setIsAutoFees] = useState(true)
  const [isAutoFeesEdit, setIsAutoFeesEdit] = useState(true)
  const [notes, setNotes] = useState<string>('')
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<number[]>([])
  const [detectedName, setDetectedName] = useState('')
  const [isDetecting, setIsDetecting] = useState(false)

  const { data: allStrategies = [], refetch: refetchStrategies } = useQuery({
    queryKey: ['strategies', currentAccount?.id],
    queryFn: () => api.listStrategies(currentAccount?.id ?? 1)
  })

  const createStrategyMutation = useMutation({
    mutationFn: (name: string) => api.createStrategy({ name }, currentAccount?.id ?? 1),
    onSuccess: (newSt) => {
      refetchStrategies()
      setSelectedStrategyIds(prev => [...prev, newSt.id])
    }
  })

  const createStrategyForEditMutation = useMutation({
    mutationFn: (name: string) => api.createStrategy({ name }, currentAccount?.id ?? 1),
    onSuccess: (newSt) => {
      refetchStrategies()
      if (draft) {
        setDraft({ ...draft, strategy_ids: [...draft.strategy_ids, newSt.id] })
      }
    }
  })

  // Auto-calculate fees logic
  useEffect(() => {
    if (!isAutoFees) return
    const ep = parseDecimal(entryPriceStr)
    const sz = parseDecimal(sizeStr)
    const xp = parseDecimal(exitPriceStr)

    if (ep > 0 && sz > 0) {
      setFeesStr(`(${ep} * ${sz} * 0.125 / 100) + 3`)
    } else {
      setFeesStr('')
    }

    if (xp > 0 && sz > 0) {
      setExitFeesStr(`(${xp} * ${sz} * 0.125 / 100) + 3`)
    } else {
      setExitFeesStr('')
    }
  }, [isAutoFees, entryPriceStr, exitPriceStr, sizeStr])

  // Symbol suggestion & asset class detection
  useEffect(() => {
    const sym = symbol.trim().toUpperCase()
    if (sym.length < 2) {
      setDetectedName('')
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
      } catch (e) {
        // quiet failure for auto-detection
      } finally {
        setIsDetecting(false)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [symbol])

  const [tradeSearch, setTradeSearch] = useState<string>('')
  const [tradeStatus, setTradeStatus] = useState<'all' | 'open' | 'closed'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isDividendModalOpen, setIsDividendModalOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<TradeDraft | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

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

  const createMutation = useMutation({
    mutationFn: (payload: TradeCreate) => api.createTrade(payload, currentAccount?.id ?? 1),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['cashBalance', currentAccount?.id ?? 1] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions', currentAccount?.id ?? 1] }),
      ])
      saveSymbol(symbol.trim().toUpperCase())
      setSymbol('')
      setEntryPriceStr('')
      setExitPriceStr('')
      setSizeStr('')
      setFeesStr('')
      setExitFeesStr('')
      setNotes('')
      setExitDateLocal('')
      setEntryDateLocal(defaultEntry)
      setDetectedName('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TradeUpdate }) => api.updateTrade(id, payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['cashBalance', currentAccount?.id ?? 1] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions', currentAccount?.id ?? 1] }),
      ])
      setEditMode(false)
      setDraft(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTrade(id),
    onSuccess: async (_data, deletedId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['cashBalance', currentAccount?.id ?? 1] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions', currentAccount?.id ?? 1] }),
      ])
      setSelectedId((cur) => (cur === deletedId ? null : cur))
    },
  })

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => api.uploadScreenshot(id, file),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] })
    },
  })

  const deleteScreenshotMutation = useMutation({
    mutationFn: (id: number) => api.deleteTradeScreenshot(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] })
    },
  })

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importTradesCsv(file, currentAccount?.id ?? 1),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] })
      setSymbol('')
      setEntryPriceStr('')
      setExitPriceStr('')
      setSizeStr('')
      setNotes('')
      setDetectedName('')
      alert('Import completed')
    },
    onError: (err) => alert(String(err)),
  })

  const cashAvailable = Number(ov?.kpis.cash_balance ?? 0)
  const entryPx = parseDecimal(entryPriceStr)
  const sizeNum = parseDecimal(sizeStr)
  const feesNum = evaluateEquation(feesStr)
  const hasExitOnCreate = exitPriceStr.trim() !== ''
  const requiredCash = entryPx * sizeNum + feesNum
  const cashOk = !symbol.trim() || hasExitOnCreate || requiredCash <= 0 || cashAvailable >= requiredCash - 1e-9
  const requiredPct = requiredCash > 0 && cashAvailable > 0 ? Math.min(100, (requiredCash / cashAvailable) * 100) : requiredCash > 0 ? 100 : 0

  const rows = useMemo(() => {
    const q = tradeSearch.trim().toUpperCase()
    return (ov?.trades ?? [])
      .filter((t) => {
        if (tradeStatus === 'open' && t.exit_price != null) return false
        if (tradeStatus === 'closed' && t.exit_price == null) return false
        if (q && !t.symbol.toUpperCase().includes(q)) return false
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

  const canCreate =
    symbol.trim().length > 0 && entryDateLocal.length > 0 && Number.isFinite(entryPx) && entryPx > 0 && Number.isFinite(sizeNum) && sizeNum > 0

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
        entry_date: new Date(draft.entry_date).toISOString(),
        exit_date: draft.exit_date.trim() ? new Date(draft.exit_date).toISOString() : null,
        notes: draft.notes.trim() || null,
      },
    })
  }

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Trades</div>
          <div className="pageSubtitle">Add/close/re-open trades. Deposit or withdraw cash on the Dashboard.</div>
        </div>
        <div className="detailsActions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 12 }}>
          <button className="btn btnGhost" onClick={() => setIsDividendModalOpen(true)}>Add Dividend</button>
          <OverviewSyncBar />
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load trades. Start the API server.</div> : null}

      <div className="card panel" style={{ marginTop: 12 }}>
        <div className="panelTitle">Add trade</div>
        <div className="formGrid">
          <label>
            <div className="label">Symbol</div>
            <input
              type="text"
              autoComplete="off"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Any ticker or symbol (free text)"
            />
            {detectedName && (
              <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontWeight: 500 }}>
                {detectedName}
              </div>
            )}
            {isDetecting && (
              <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 4 }}>Detecting...</div>
            )}
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
            <div className="label">Entry</div>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={entryPriceStr}
              onChange={(e) => setEntryPriceStr((prev) => normalizeDecimalTyping(prev, e.target.value))}
              placeholder="0"
            />
          </label>
          <label>
            <div className="label">Exit (optional)</div>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={exitPriceStr}
              onChange={(e) => setExitPriceStr((prev) => normalizeDecimalTyping(prev, e.target.value))}
              placeholder="—"
            />
          </label>
          <label>
            <div className="label">Size</div>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={sizeStr}
              onChange={(e) => setSizeStr((prev) => normalizeDecimalTyping(prev, e.target.value))}
              placeholder="0"
            />
          </label>
          <label>
            <div className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Entry fees</span>
                <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', color: isAutoFees ? 'var(--accent)' : 'var(--muted)' }} onClick={() => setIsAutoFees(!isAutoFees)}>
                  <input type="checkbox" checked={isAutoFees} onChange={() => { }} style={{ width: 10, height: 10 }} /> Auto
                </span>
              </div>
              {feesNum > 0 && <span className="good" style={{ fontSize: 10 }}>Val: {formatCurrency(feesNum)}</span>}
            </div>
            <input
              type="text"
              autoComplete="off"
              value={feesStr}
              onChange={(e) => {
                if (isAutoFees) setIsAutoFees(false)
                setFeesStr(e.target.value)
              }}
              placeholder="0 or equation"
            />
          </label>
          {hasExitOnCreate ? (
            <label>
              <div className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Exit fees</span>
                {evaluateEquation(exitFeesStr) > 0 && <span className="good" style={{ fontSize: 10 }}>Val: {formatCurrency(evaluateEquation(exitFeesStr))}</span>}
              </div>
              <input
                type="text"
                autoComplete="off"
                value={exitFeesStr}
                onChange={(e) => {
                  if (isAutoFees) setIsAutoFees(false)
                  setExitFeesStr(e.target.value)
                }}
                placeholder="0 or equation"
              />
            </label>
          ) : null}
          <label className="span2">
            <div className="label">Strategies</div>
            <StrategySelect
              selectedIds={selectedStrategyIds}
              allStrategies={allStrategies}
              onChange={setSelectedStrategyIds}
              onCreate={async (name) => { createStrategyMutation.mutate(name) }}
            />
          </label>
          <label className="span2">
            <div className="label">Entry date</div>
            <input type="datetime-local" value={entryDateLocal} onChange={(e) => setEntryDateLocal(e.target.value)} />
          </label>
          {hasExitOnCreate ? (
            <label className="span2">
              <div className="label">Exit date</div>
              <input type="datetime-local" value={exitDateLocal || defaultEntry} onChange={(e) => setExitDateLocal(e.target.value)} />
            </label>
          ) : null}
          <label className="span2">
            <div className="label">Notes</div>
            <textarea value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="span2" style={{ gridColumn: '1 / -1' }}>
            <div
              className="card"
              style={{
                padding: 12,
                background: 'rgba(11, 15, 20, 0.45)',
                borderRadius: 12,
                border: '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              <div className="label" style={{ marginBottom: 8 }}>
                Order cost (required cash)
              </div>
              <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span className="muted">Entry × size</span>
                  <span className="mono">{formatCurrency(entryPx * sizeNum)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span className="muted">Total Fees</span>
                  <span className="mono">{formatCurrency(feesNum + (hasExitOnCreate ? evaluateEquation(exitFeesStr) : 0))}</span>
                </div>
                <div style={{ borderTop: '1px solid rgba(148,163,184,0.14)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 650 }}>
                  <span>Total required</span>
                  <span className="mono">{formatCurrency(entryPx * sizeNum + feesNum + (hasExitOnCreate ? evaluateEquation(exitFeesStr) : 0))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Available cash</span>
                  <span className="mono">{formatCurrency(cashAvailable)}</span>
                </div>
                {requiredCash > 0 ? (
                  <div>
                    <div style={{ height: 8, borderRadius: 999, background: 'rgba(148,163,184,0.12)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, cashAvailable > 0 ? (requiredCash / cashAvailable) * 100 : 100)}%`,
                          borderRadius: 999,
                          background: cashOk ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)',
                          transition: 'width 0.2s ease',
                        }}
                      />
                    </div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                      {cashOk
                        ? `Uses about ${requiredPct.toFixed(0)}% of available cash`
                        : `Short by ${formatCurrency(Math.max(0, requiredCash - cashAvailable))}`}
                    </div>
                  </div>
                ) : null}
                {!cashOk && requiredCash > 0 ? <div className="error">Not enough available cash for this trade.</div> : null}
              </div>
            </div>
          </div>

          <button
            className="btn"
            disabled={createMutation.isPending || !canCreate || !cashOk}
            onClick={() =>
              createMutation.mutate({
                symbol: symbol.trim().toUpperCase(),
                market,
                trade_type: 'Long',
                entry_price: entryPx,
                exit_price: exitPriceStr.trim() === '' ? null : parseDecimal(exitPriceStr),
                stop_loss: null,
                take_profit: null,
                position_size: sizeNum,
                strategy_used: null,
                strategy_ids: selectedStrategyIds,
                indicators_used: null,
                entry_date: new Date(entryDateLocal).toISOString(),
                exit_date: hasExitOnCreate ? new Date(exitDateLocal || defaultEntry).toISOString() : null,
                fees: evaluateEquation(feesStr),
                exit_fees: hasExitOnCreate ? evaluateEquation(exitFeesStr) : 0,
                notes: notes.trim() || null,
                lessons_learned: null,
              })
            }
          >
            Add trade
          </button>
        </div>
        {createMutation.error ? <div className="error">Failed to create trade.</div> : null}
      </div>

      <div className="tradeSplit" style={{ marginTop: 16 }}>
        <div className="card panel" style={{ minWidth: 0 }}>
          <div className="panelTitleRow">
            <div className="panelTitle">Trades</div>
            <div className="detailsActions" style={{ justifyContent: 'flex-end' }}>
              <div className="muted" style={{ fontSize: 12, marginRight: 12 }}>
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
          <div className="tableWrap" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Symbol</th>
                  <th>Type</th>
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
                    <td className="mono">{t.trade_type}</td>
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
                          <span key={s.id} className="statusPill" style={{ background: s.color || 'var(--accent-dim)', color: 'var(--text-strong)', border: 'none', fontSize: 10, padding: '2px 6px' }}>
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
                    <td colSpan={11} className="muted">
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
                    <span className="muted">Trade:</span> <span className="mono">{selectedTrade.symbol}</span> #{selectedTrade.id}
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
                    <span className="mono" style={{ fontWeight: 700 }}>{formatCurrency((selectedTrade.fees ?? 0) + (selectedTrade.exit_fees ?? 0))}</span>
                  </div>

                  <div className="detailsActions" style={{ marginTop: 10 }}>
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
                <div className="formGrid detailsForm" style={{ marginTop: 8 }}>
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
                      {evaluateEquation(draft.fees) > 0 && <span className="good" style={{ fontSize: 10 }}>Val: {formatCurrency(evaluateEquation(draft.fees))}</span>}
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
                      {evaluateEquation(draft.exit_fees) > 0 && <span className="good" style={{ fontSize: 10 }}>Val: {formatCurrency(evaluateEquation(draft.exit_fees))}</span>}
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
                    <textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
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
                <div style={{ marginTop: 14 }}>
                  <div className="label" style={{ marginBottom: 8 }}>
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
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            cursor: 'zoom-out',
          }}
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Screenshot"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'default' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      <div className="card panel" style={{ marginTop: 12 }}>
        <div className="panelTitle">Import / Export trades</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <label className="fileBtn">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                importMutation.mutate(f)
                e.currentTarget.value = ''
              }}
            />
            {importMutation.status === 'pending' ? 'Importing…' : 'Import CSV'}
          </label>
          <button
            className="btn"
            onClick={async () => {
              try {
                const blob = await api.exportTradesCsv(currentAccount?.id ?? 1)
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'trades_export.csv'
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
              } catch (e) {
                alert(String(e))
              }
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
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
