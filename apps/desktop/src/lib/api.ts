export type Market = 'Stocks' | 'Funds' | 'Crypto' | 'Forex'
export type TradeType = 'Long' | 'Short'

export type PsychologyState = 'Confident' | 'Fear' | 'FOMO' | 'Calm' | 'Overtrading'

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

export type InsightCard = {
  title: string
  severity: 'good' | 'warning' | 'info'
  detail: string
}

export type InsightsResponse = {
  insights: InsightCard[]
  closed_trades?: number
}

export type PerfRow = {
  key: string
  count: number
  total: number
  avg: number
  win_rate: number
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
  by_trade_type: PerfRow[]
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
}

export type OverviewResponse = {
  kpis: OverviewKpis
  allocation: Record<string, number>
  holdings: HoldingRow[]
  trades: Trade[]
  chart: OverviewChartSeries
}

export type QuantRow = Record<string, string | number | null>

export type QuantIndicatorsResponse = {
  rows: QuantRow[]
  meta: { count: number; tail: number; columns: string[] }
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
  trade_type: TradeType
  entry_price: number
  exit_price: number | null
  stop_loss: number | null
  take_profit: number | null
  position_size: number
  strategy_used: string | null
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
}

export type TradeCreate = Omit<
  Trade,
  | 'id'
  | 'pnl'
  | 'return_pct'
  | 'risk_reward'
  | 'duration_seconds'
  | 'screenshot_path'
>

export type TradeUpdate = Partial<
  Pick<
    Trade,
    | 'symbol'
    | 'market'
    | 'trade_type'
    | 'entry_price'
    | 'exit_price'
    | 'stop_loss'
    | 'take_profit'
    | 'position_size'
    | 'strategy_used'
    | 'indicators_used'
    | 'entry_date'
    | 'exit_date'
    | 'fees'
    | 'exit_fees'
    | 'notes'
    | 'lessons_learned'
  >
>

export type CashTxType = 'Deposit' | 'Withdraw' | 'Trade Buy' | 'Trade Sell' | 'Fee' | 'Adjustment'

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
  if (init?.body != null) {
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

async function uploadFileWithQuery<T>(path: string, file: File, query: Record<string, string | number>): Promise<T> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) params.set(k, String(v))
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}${path}?${params.toString()}`, { method: 'POST', body: form })
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
  listTrades: () => apiFetch<Trade[]>('/trades'),
  createTrade: (payload: TradeCreate) =>
    apiFetch<Trade>('/trades', { method: 'POST', body: JSON.stringify(payload) }),
  updateTrade: (id: number, payload: TradeUpdate) =>
    apiFetch<Trade>(`/trades/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  uploadScreenshot: (id: number, file: File) => uploadFile<Trade>(`/trades/${id}/screenshot`, file),
  deleteTradeScreenshot: (id: number) => apiFetch<Trade>(`/trades/${id}/screenshot`, { method: 'DELETE' }),
  importTradesCsv: (file: File) => uploadFile<{ inserted: number; total_errors: number; errors: Array<{ row: number; error: string }> }>(
    '/trades/import/csv',
    file,
  ),
  exportTradesCsv: () => download('/trades/export/csv'),
  deleteTrade: (id: number) => apiFetch<{ deleted: true }>(`/trades/${id}`, { method: 'DELETE' }),

  listPsychology: () => apiFetch<PsychologyEntry[]>('/psychology'),
  createPsychology: (payload: PsychologyCreate) =>
    apiFetch<PsychologyEntry>('/psychology', { method: 'POST', body: JSON.stringify(payload) }),
  deletePsychology: (id: number) => apiFetch<{ deleted: true }>(`/psychology/${id}`, { method: 'DELETE' }),
  psychologySummary: () => apiFetch<PsychologySummaryRow[]>('/psychology/summary'),

  insights: () => apiFetch<InsightsResponse>('/insights'),
  performanceAnalytics: (params: { start?: string; end?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.start) q.set('start', params.start)
    if (params.end) q.set('end', params.end)
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<PerformanceAnalyticsResponse>(`/performance/analytics${suffix}`)
  },

  listAssets: () => apiFetch<Asset[]>('/assets'),
  createAsset: (payload: AssetCreate) => apiFetch<Asset>('/assets', { method: 'POST', body: JSON.stringify(payload) }),
  updateAsset: (id: number, payload: AssetUpdate) =>
    apiFetch<Asset>(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAsset: (id: number) => apiFetch<{ deleted: true }>(`/assets/${id}`, { method: 'DELETE' }),
  portfolioSummary: () => apiFetch<PortfolioSummary>('/portfolio/summary'),
  portfolioHoldings: () => apiFetch<HoldingRow[]>('/portfolio/holdings'),

  quantIndicators: (file: File, query: Record<string, string | number> = {}) =>
    uploadFileWithQuery<QuantIndicatorsResponse>('/quant/indicators', file, query),

  listLessons: (params: { q?: string; category?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.q) q.set('q', params.q)
    if (params.category) q.set('category', params.category)
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<Lesson[]>(`/lessons${suffix}`)
  },
  createLesson: (payload: LessonCreate) =>
    apiFetch<Lesson>('/lessons', { method: 'POST', body: JSON.stringify(payload) }),
  deleteLesson: (id: number) => apiFetch<{ deleted: true }>(`/lessons/${id}`, { method: 'DELETE' }),

  downloadPerformancePdf: () => download('/reports/performance.pdf'),

  overview: (method?: string) => {
    const q = new URLSearchParams()
    if (method) q.set('method', method)
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<OverviewResponse>(`/overview${suffix}`)
  },
  fundamentals: (symbol: string, refresh: boolean = false) => {
    const q = new URLSearchParams()
    if (refresh) q.set('refresh', '1')
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<any>(`/fundamentals/${encodeURIComponent(symbol)}${suffix}`)
  },

  technicalIndicators: (symbol: string, period: string = '1y', interval: string = '1d') => {
    const q = new URLSearchParams()
    if (period) q.set('period', period)
    if (interval) q.set('interval', interval)
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<any>(`/technical/${encodeURIComponent(symbol)}${suffix}`)
  },

  smartMoney: (symbol: string, period: string = '1y', interval: string = '1d') => {
    const q = new URLSearchParams()
    if (period) q.set('period', period)
    if (interval) q.set('interval', interval)
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return apiFetch<any>(`/smart-money/${encodeURIComponent(symbol)}${suffix}`)
  },

  cashBalance: () => apiFetch<CashBalanceResponse>('/cash/balance'),
  cashTransactions: () => apiFetch<CashTx[]>('/cash/transactions'),
  cashDeposit: (payload: { amount: number; at?: string; note?: string }) =>
    apiFetch<DepositResponse>('/cash/deposit', { method: 'POST', body: JSON.stringify(payload) }),
  cashWithdraw: (payload: { amount: number; at?: string; note?: string }) =>
    apiFetch<CashBalanceResponse>('/cash/withdraw', { method: 'POST', body: JSON.stringify(payload) }),
  cashAdjust: (payload: { amount: number; at?: string; note?: string }) =>
    apiFetch<CashBalanceResponse>('/cash/adjust', { method: 'POST', body: JSON.stringify(payload) }),

  backupDataset: () => download('/settings/backup.json'),
  clearDataset: () =>
    apiFetch<{ cleared: true; deleted: Record<string, number> }>('/settings/clear', {
      method: 'POST',
    }),
}

