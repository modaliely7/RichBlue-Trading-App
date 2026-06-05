export type Market = 'Stocks' | 'Funds' | 'Crypto' | 'Forex'

export type PsychologyState = 'Confident' | 'Fear' | 'FOMO' | 'Calm' | 'Overtrading'

export type AccountType = 'Real' | 'Testing'

export type Account = {
  id: number
  name: string
  account_type: AccountType
  created_at: string
}

export type AccountCreate = { name: string }

export type Strategy = {
  id: number
  account_id: number
  name: string
  color: string | null
  created_at: string
}

export type StrategyCreate = { name: string; color?: string }
export type StrategyUpdate = Partial<StrategyCreate>

export type PsychologyEntry = {
  id: number
  state: PsychologyState
  intensity: number
  at: string
  trade_id: number | null
  notes: string | null
}

export type PsychologyCreate = Omit<PsychologyEntry, 'id'>
export type PsychologyUpdate = Partial<Omit<PsychologyEntry, 'id'>>

export type PsychologySummaryRow = {
  state: PsychologyState
  count: number
  avg_pnl: number | null
  win_rate: number | null
}

export type PerfRow = {
  key: string
  count: number
  total: number
  avg: number
  win_rate: number
}

export type PerformanceAdvancedMetrics = {
  win_rate: number
  avg_win_amount: number
  max_win_amount: number
  avg_loss_amount: number
  max_loss_amount: number
  avg_risk_reward: number
  max_risk_reward: number
  profit_factor: number
  gross_win: number
  gross_loss: number
  closed_count: number
  win_count: number
  loss_count: number
}

export type PerformanceAnalyticsResponse = {
  overall: { count: number; total: number; avg: number; win_rate: number }
  closed_trades: number
  best_strategy: PerfRow | null
  worst_strategy: PerfRow | null
  best_day: PerfRow | null
  worst_day: PerfRow | null
  best_hour: PerfRow | null
  worst_hour: PerfRow | null
  by_month: PerfRow[]
  by_day_of_week: PerfRow[]
  by_hour: PerfRow[]
  by_strategy: PerfRow[]
  by_market: PerfRow[]
  advanced?: PerformanceAdvancedMetrics
}

export type AssetClass = 'Stocks' | 'ETFs / Funds' | 'Crypto' | 'Cash'

export type Asset = {
  id: number
  symbol: string
  asset_class: AssetClass
  quantity: number
  avg_cost: number
  current_price: number
  notes: string | null
  updated_at: string

  market_value: number
  cost_basis: number
  unrealized_pnl: number
  unrealized_pnl_pct: number | null
}

export type AssetCreate = Omit<Asset, 'id' | 'market_value' | 'cost_basis' | 'unrealized_pnl' | 'unrealized_pnl_pct'>
export type AssetUpdate = Partial<AssetCreate>

export type PortfolioSummary = {
  total_value: number
  allocation: Record<string, number>
}

export type HoldingRow = {
  symbol: string
  open_quantity: number
  avg_open_cost: number | null
  open_cost_basis: number
  realized_pnl: number
  closed_trades: number
  open_trades: number
  current_price: number | null
  market_value: number | null
  unrealized_pnl: number | null
  unrealized_pnl_pct: number | null
}

export type OverviewKpis = {
  as_of: string
  cash_balance: number
  assets_market_value: number
  portfolio_value: number
  net_deposited: number
  total_return_value: number
  total_return_pct: number | null
  realized_pnl_total: number
  open_positions: number
  open_symbols: number
}

export type OverviewChartSeries = {
  labels: string[]
  portfolio_value: number[]
  net_deposited: number[]
  total_return_value: number[]
  portfolio_value_liquidation?: number[]
  total_pnl?: number[]
}

export type OverviewResponse = {
  kpis: OverviewKpis
  allocation: Record<string, number>
  fund_allocation?: Record<string, number>
  earnings_allocation?: Record<string, number>
  holdings: HoldingRow[]
  trades: Trade[]
  chart: OverviewChartSeries
}

export type SymbolLookupResponse = {
  symbol: string
  company_name: string | null
  quote_type: string | null
}

export type EgxSymbol = {
  id: number
  canonical: string
  name_en: string
  name_ar: string | null
  sector: string | null
  exchange: string
  currency: string
  country: string
  is_active: boolean
  last_loaded_at: string | null
  last_price: number | null
  last_price_at: string | null
}

export type Quote = {
  symbol: string
  price: number
  currency: string
  provider: string
  fetched_at: string
  previous_close: number | null
  day_high: number | null
  day_low: number | null
  day_change: number | null
  day_change_pct: number | null
  year_high: number | null
  year_low: number | null
  volume: number | null
  market_state: string | null
  is_market_open: boolean | null
}

export type Quotes = { quotes: Quote[] }

export type PricePoint = {
  at: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type PriceHistoryResponse = {
  symbol: string
  points: PricePoint[]
}

export type MarketStatus = {
  is_market_open: boolean
  session_label: string
  next_open_at: string | null
  next_close_at: string | null
  last_refresh_at: string | null
  symbols_in_db: number
  provider: string
  note: string | null
}

export type RefreshResult = {
  requested: string[]
  success: string[]
  errors: Record<string, string>
  started_at: string
  finished_at: string | null
  ok_count: number
  fail_count: number
}

export type EodSchedule = {
  id: number
  market_code: string
  market_name: string
  eod_hour: number
  eod_minute: number
  timezone: string
  is_active: boolean
  updated_at: string
}

export type LessonCategory = 'Mistake' | 'Lesson' | 'Psychological note' | 'Strategy insight'

export type Lesson = {
  id: number
  title: string
  category: LessonCategory
  tags: string | null
  trade_id: number | null
  content: string
  created_at: string
  updated_at: string
}

export type LessonCreate = Omit<Lesson, 'id'>
export type LessonUpdate = Partial<Omit<Lesson, 'id' | 'created_at'>>

export type Trade = {
  id: number
  symbol: string
  market: Market
  entry_price: number
  exit_price: number | null
  stop_loss: number | null
  take_profit: number | null
  position_size: number
  indicators_used: string | null
  entry_date: string
  exit_date: string | null
  fees: number
  exit_fees: number
  notes: string | null
  lessons_learned: string | null
  screenshot_path: string | null
  pnl: number | null
  return_pct: number | null
  risk_reward: number | null
  duration_seconds: number | null
  strategies: Strategy[]
}

export type TradeCreate = Omit<
  Trade,
  | 'id'
  | 'pnl'
  | 'return_pct'
  | 'risk_reward'
  | 'duration_seconds'
  | 'screenshot_path'
  | 'strategies'
> & { strategy_ids?: number[] }

export type TradeUpdate = Partial<
  Pick<
    Trade,
    | 'symbol'
    | 'market'
    | 'entry_price'
    | 'exit_price'
    | 'stop_loss'
    | 'take_profit'
    | 'position_size'
    | 'indicators_used'
    | 'entry_date'
    | 'exit_date'
    | 'fees'
    | 'exit_fees'
    | 'notes'
    | 'lessons_learned'
  > & { strategy_ids?: number[] }
>

export type CashTxType = 'Deposit' | 'Withdraw' | 'Trade Buy' | 'Trade Sell' | 'Fee' | 'Adjustment' | 'Dividend'

export type CashTx = {
  id: number
  amount: number
  tx_type: CashTxType
  trade_id: number | null
  symbol: string | null
  at: string
  note: string | null
}

export type CashBalanceResponse = {
  balance: number
}

export type DepositResponse = CashBalanceResponse & { tx_id?: number }

export const API_BASE = 'http://127.0.0.1:8001'

export function tradeScreenshotPublicUrl(screenshotPath: string | null): string | null {
  if (!screenshotPath) return null
  const path = screenshotPath.replace(/^\/+/, '')
  return `${API_BASE}/static/${path}`
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (init?.body != null && typeof init.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }

  const url = `${API_BASE}${path}`
  try {
    const res = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      ...init,
      headers,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `Request failed (${res.status})`)
    }
    return (await res.json()) as T
  } catch (error) {
    console.error('API fetch failed', { url, init, error })
    throw error
  }
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Upload failed (${res.status})`)
  }
  return (await res.json()) as T
}

async function download(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Download failed (${res.status})`)
  }
  return await res.blob()
}

export const api = {
  listAccounts: () => apiFetch<Account[]>('/accounts'),
  createAccount: (payload: AccountCreate) => apiFetch<Account>('/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  getAccount: (id: number) => apiFetch<Account>(`/accounts/${id}`),
  updateAccount: (id: number, payload: Partial<AccountCreate>) => apiFetch<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAccount: (id: number) => apiFetch<{ deleted: true }>(`/accounts/${id}`, { method: 'DELETE' }),

  listTrades: (accountId: number = 1) => apiFetch<Trade[]>(`/trades?account_id=${accountId}`),
  createTrade: (payload: TradeCreate, accountId: number = 1) =>
    apiFetch<Trade>(`/trades?account_id=${accountId}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateTrade: (id: number, payload: TradeUpdate) =>
    apiFetch<Trade>(`/trades/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  uploadScreenshot: (id: number, file: File) => uploadFile<Trade>(`/trades/${id}/screenshot`, file),
  deleteTradeScreenshot: (id: number) => apiFetch<Trade>(`/trades/${id}/screenshot`, { method: 'DELETE' }),
  importTradesCsv: (file: File, accountId: number = 1) => uploadFile<{ inserted: number; total_errors: number; errors: Array<{ row: number; error: string }> }>(
    `/trades/import/csv?account_id=${accountId}`,
    file,
  ),
  exportTradesCsv: (accountId: number = 1) => download(`/trades/export/csv?account_id=${accountId}`),
  deleteTrade: (id: number) => apiFetch<{ deleted: true }>(`/trades/${id}`, { method: 'DELETE' }),

  downloadValuation: (format: 'pdf' | 'xlsx', accountId: number = 1) =>
    download(`/reports/valuation.${format}?account_id=${accountId}`),
  downloadRealizedUnrealized: (format: 'pdf' | 'xlsx', start?: string, end?: string, accountId: number = 1) => {
    const q = new URLSearchParams({ account_id: String(accountId) })
    if (start) q.set('start', start)
    if (end) q.set('end', end)
    return download(`/reports/realized-unrealized.${format}?${q.toString()}`)
  },
  downloadCostVsMarket: (format: 'pdf' | 'xlsx', accountId: number = 1) =>
    download(`/reports/cost-vs-market.${format}?account_id=${accountId}`),
  downloadTax: (format: 'pdf' | 'xlsx', start?: string, end?: string, accountId: number = 1) => {
    const q = new URLSearchParams({ account_id: String(accountId) })
    if (start) q.set('start', start)
    if (end) q.set('end', end)
    return download(`/reports/tax.${format}?${q.toString()}`)
  },
  downloadMonthlyDigest: (format: 'pdf' | 'xlsx', start?: string, end?: string, accountId: number = 1) => {
    const q = new URLSearchParams({ account_id: String(accountId) })
    if (start) q.set('start', start)
    if (end) q.set('end', end)
    return download(`/reports/monthly-digest.${format}?${q.toString()}`)
  },

  listPsychology: (accountId: number = 1) => apiFetch<PsychologyEntry[]>(`/psychology?account_id=${accountId}`),
  createPsychology: (payload: PsychologyCreate) =>
    apiFetch<PsychologyEntry>('/psychology', { method: 'POST', body: JSON.stringify(payload) }),
  deletePsychology: (id: number) => apiFetch<{ deleted: true }>(`/psychology/${id}`, { method: 'DELETE' }),
  psychologySummary: (accountId: number = 1) => apiFetch<PsychologySummaryRow[]>(`/psychology/summary?account_id=${accountId}`),

  performanceAnalytics: (params: { start?: string; end?: string; account_id?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.start) q.set('start', params.start)
    if (params.end) q.set('end', params.end)
    if (params.account_id) q.set('account_id', String(params.account_id))
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<PerformanceAnalyticsResponse>(`/performance/analytics${suffix}`)
  },

  listAssets: (accountId: number = 1) => apiFetch<Asset[]>(`/assets?account_id=${accountId}`),
  createAsset: (payload: AssetCreate, accountId: number = 1) => apiFetch<Asset>(`/assets?account_id=${accountId}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateAsset: (id: number, payload: AssetUpdate) =>
    apiFetch<Asset>(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAsset: (id: number) => apiFetch<{ deleted: true }>(`/assets/${id}`, { method: 'DELETE' }),
  portfolioSummary: (accountId: number = 1) => apiFetch<PortfolioSummary>(`/portfolio/summary?account_id=${accountId}`),
  portfolioHoldings: (accountId: number = 1) => apiFetch<HoldingRow[]>(`/portfolio/holdings?account_id=${accountId}`),
  portfolioRefreshPrices: (accountId: number = 1) =>
    apiFetch<RefreshResult>(`/portfolio/refresh-prices?account_id=${accountId}`, { method: 'POST' }),

  listLessons: (params: { q?: string; category?: string; account_id?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.q) q.set('q', params.q)
    if (params.category) q.set('category', params.category)
    if (params.account_id) q.set('account_id', String(params.account_id))
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<Lesson[]>(`/lessons${suffix}`)
  },
  createLesson: (payload: LessonCreate) =>
    apiFetch<Lesson>('/lessons', { method: 'POST', body: JSON.stringify(payload) }),
  deleteLesson: (id: number) => apiFetch<{ deleted: true }>(`/lessons/${id}`, { method: 'DELETE' }),

  exportReportPdf: (params: { start?: string; end?: string; account_id?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.start) q.set('start', params.start)
    if (params.end) q.set('end', params.end)
    if (params.account_id) q.set('account_id', String(params.account_id))
    return download(`/reports/performance.pdf?${q.toString()}`)
  },
  exportReportExcel: (params: { start?: string; end?: string; account_id?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.start) q.set('start', params.start)
    if (params.end) q.set('end', params.end)
    if (params.account_id) q.set('account_id', String(params.account_id))
    return download(`/reports/performance.xlsx?${q.toString()}`)
  },

  recordDividend: (payload: { account_id: number; symbol: string; amount: number; is_stock_dividend?: boolean }) =>
    apiFetch<{ status: string }>('/cash/dividend', { method: 'POST', body: JSON.stringify(payload) }),
  recordTradeDividend: (tradeId: number, payload: { amount: number; is_stock_dividend: boolean; at?: string; note?: string }) =>
    apiFetch<{ status: string }>(`/trades/${tradeId}/dividend`, { method: 'POST', body: JSON.stringify(payload) }),

  overview: (accountId: number = 1, method?: string) => {
    const q = new URLSearchParams()
    q.set('account_id', String(accountId))
    if (method) q.set('method', method)
    return apiFetch<OverviewResponse>(`/overview?${q.toString()}`)
  },
  lookupSymbol: (symbol: string) =>
    apiFetch<SymbolLookupResponse>(`/symbols/lookup/${encodeURIComponent(symbol)}`),

  cashBalance: (accountId: number = 1) => apiFetch<CashBalanceResponse>(`/cash/balance?account_id=${accountId}`),
  cashTransactions: (accountId: number = 1) => apiFetch<CashTx[]>(`/cash/transactions?account_id=${accountId}`),
  cashDeposit: (payload: { amount: number; at?: string; note?: string }, accountId: number = 1) =>
    apiFetch<DepositResponse>(`/cash/deposit?account_id=${accountId}`, { method: 'POST', body: JSON.stringify(payload) }),
  cashWithdraw: (payload: { amount: number; at?: string; note?: string }, accountId: number = 1) =>
    apiFetch<CashBalanceResponse>(`/cash/withdraw?account_id=${accountId}`, { method: 'POST', body: JSON.stringify(payload) }),
  cashAdjust: (payload: { amount: number; at?: string; note?: string }, accountId: number = 1) =>
    apiFetch<CashBalanceResponse>(`/cash/adjust?account_id=${accountId}`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteCashTransaction: (id: number) => apiFetch<{ deleted: true }>(`/cash/transactions/${id}`, { method: 'DELETE' }),
  updateCashTransaction: (id: number, payload: { amount: number; at?: string; note?: string }) =>
    apiFetch<CashTx>(`/cash/transactions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  backupDataset: (accountId: number = 1) => download(`/settings/backup.json?account_id=${accountId}`),
  clearDataset: (accountId: number = 1) =>
    apiFetch<{ status: string }>(`/settings/clear?account_id=${accountId}`, { method: 'POST' }),
  restoreDataset: (file: File, accountId: number = 1) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch<{ status: string; trades: number }>(`/settings/restore?account_id=${accountId}`, {
      method: 'POST',
      body: fd,
    })
  },

  listStrategies: (accountId: number = 1) => apiFetch<Strategy[]>(`/strategies?account_id=${accountId}`),
  createStrategy: (payload: StrategyCreate, accountId: number = 1) =>
    apiFetch<Strategy>(`/strategies?account_id=${accountId}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateStrategy: (id: number, payload: StrategyUpdate) =>
    apiFetch<Strategy>(`/strategies/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteStrategy: (id: number) => apiFetch<{ deleted: true }>(`/strategies/${id}`, { method: 'DELETE' }),

  // Market data (Phase 6)
  listEgxSymbols: (query?: string, limit: number = 50) => {
    const q = new URLSearchParams()
    if (query) q.set('query', query)
    q.set('limit', String(limit))
    return apiFetch<EgxSymbol[]>(`/market-data/egx-symbols?${q.toString()}`)
  },
  getQuote: (symbol: string, useCache: boolean = true) => {
    const q = new URLSearchParams()
    if (!useCache) q.set('use_cache', 'false')
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<Quote>(`/market-data/quote/${encodeURIComponent(symbol)}${suffix}`)
  },
  getQuotes: (symbols: string[]) => {
    const q = new URLSearchParams()
    for (const s of symbols) q.append('symbols', s)
    return apiFetch<Quotes>(`/market-data/quotes?${q.toString()}`)
  },
  getPriceHistory: (symbol: string, days: number = 180) =>
    apiFetch<PriceHistoryResponse>(`/market-data/history/${encodeURIComponent(symbol)}?days=${days}`),
  getMarketStatus: () => apiFetch<MarketStatus>('/market-data/status'),
  refreshMarketData: (symbols?: string[]) => {
    const q = new URLSearchParams()
    if (symbols) for (const s of symbols) q.append('symbols', s)
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<RefreshResult>(`/market-data/refresh${suffix}`, { method: 'POST' })
  },
  refreshMarketDataNow: () =>
    apiFetch<RefreshResult>('/settings/market-data/refresh-now', { method: 'POST' }),
  getEodSchedule: () => apiFetch<EodSchedule[]>('/settings/market-data/schedule'),
  updateEodSchedule: (id: number, payload: Partial<Pick<EodSchedule, 'eod_hour' | 'eod_minute' | 'timezone' | 'is_active'>>) =>
    apiFetch<EodSchedule>(`/settings/market-data/schedule/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  refreshSymbolsCatalog: () =>
    apiFetch<{ touched: number }>('/market-data/refresh-symbols', { method: 'POST' }),
}
