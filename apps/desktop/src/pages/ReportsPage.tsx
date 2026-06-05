import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileText, Table2, Calendar, TrendingUp, Receipt, Layers, Download, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useAccount } from '../components/AccountContext'
import { PageHeader } from '../components/ui'

type ReportId = 'valuation' | 'realized-unrealized' | 'cost-vs-market' | 'tax' | 'monthly-digest'

interface ReportDef {
  id: ReportId
  title: string
  blurb: string
  icon: typeof FileText
  hasPeriod: boolean
}

const REPORTS: ReportDef[] = [
  {
    id: 'valuation',
    title: 'Current Valuation',
    blurb: 'Open positions priced at today\'s market value. Unrealized P&L per symbol.',
    icon: TrendingUp,
    hasPeriod: false,
  },
  {
    id: 'realized-unrealized',
    title: 'Realized vs Unrealized',
    blurb: 'Closed-trade P&L plus open-position mark-to-market. The two halves of your net worth.',
    icon: Layers,
    hasPeriod: true,
  },
  {
    id: 'cost-vs-market',
    title: 'Cost vs Market',
    blurb: 'Side-by-side cost basis vs current market value for every open position.',
    icon: Table2,
    hasPeriod: false,
  },
  {
    id: 'tax',
    title: 'Tax',
    blurb: 'Closed trades with gross P&L, fees, and net P&L. Monthly summary included.',
    icon: Receipt,
    hasPeriod: true,
  },
  {
    id: 'monthly-digest',
    title: 'Monthly Digest',
    blurb: 'One section per month: trade count, win rate, best/worst trade, top strategy, fees.',
    icon: Calendar,
    hasPeriod: true,
  },
]

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function ReportsPage() {
  const { currentAccount } = useAccount()
  const accountId = currentAccount?.id ?? 1
  const [period, setPeriod] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const [lastDownloaded, setLastDownloaded] = useState<string>('')

  const downloadMutation = useMutation({
    mutationFn: async (args: { report: ReportDef; format: 'pdf' | 'xlsx' }) => {
      const { report, format } = args
      const start = report.hasPeriod && period.start ? period.start : undefined
      const end = report.hasPeriod && period.end ? period.end : undefined
      let blob: Blob
      let fallback: string
      switch (report.id) {
        case 'valuation':
          blob = await api.downloadValuation(format, accountId)
          fallback = `valuation.${format}`
          break
        case 'realized-unrealized':
          blob = await api.downloadRealizedUnrealized(format, start, end, accountId)
          fallback = `realized-vs-unrealized.${format}`
          break
        case 'cost-vs-market':
          blob = await api.downloadCostVsMarket(format, accountId)
          fallback = `cost-vs-market.${format}`
          break
        case 'tax':
          blob = await api.downloadTax(format, start, end, accountId)
          fallback = `tax.${format}`
          break
        case 'monthly-digest':
          blob = await api.downloadMonthlyDigest(format, start, end, accountId)
          fallback = `monthly-digest.${format}`
          break
      }
      const dispo = blob.type.includes('pdf') ? 'pdf' : blob.type.includes('sheet') ? 'xlsx' : format
      triggerBlobDownload(blob, `${fallback.replace(/\.[a-z]+$/, '')}_${new Date().toISOString().slice(0, 10)}.${dispo}`)
      return { report: report.title, format }
    },
    onSuccess: ({ report, format }) => setLastDownloaded(`${report} (${format.toUpperCase()})`),
  })

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle="Generate share-ready PDF or Excel reports from your trading history."
      />

      <div className="reportsPeriodBar">
        <div className="reportsPeriodLabel">Period filter (for realized/unrealized, tax, monthly digest):</div>
        <div className="reportsPeriodFields">
          <input
            type="date"
            className="input"
            value={period.start}
            onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
            placeholder="Start"
          />
          <span className="muted">→</span>
          <input
            type="date"
            className="input"
            value={period.end}
            onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
            placeholder="End"
          />
          {(period.start || period.end) ? (
            <button type="button" className="reportsPeriodClear" onClick={() => setPeriod({ start: '', end: '' })}>
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {lastDownloaded ? (
        <div className="banner success reportsBanner">
          <span className="bannerIcon"><Check size={18} /></span>
          <span>Downloaded: {lastDownloaded}</span>
        </div>
      ) : null}

      <div className="reportsGrid">
        {REPORTS.map((r) => {
          const Icon = r.icon
          const busy = downloadMutation.isPending
          return (
            <div key={r.id} className="card reportsCard">
              <div className="reportsCardHeader">
                <div className="reportsCardIcon" aria-hidden>
                  <Icon size={22} />
                </div>
                <div className="reportsCardTitle">{r.title}</div>
              </div>
              <p className="reportsCardDesc">{r.blurb}</p>
              <div className="reportsCardActions">
                <button
                  type="button"
                  className="reportsDownload"
                  onClick={() => downloadMutation.mutate({ report: r, format: 'pdf' })}
                  disabled={busy}
                >
                  <Download size={16} /> PDF
                </button>
                <button
                  type="button"
                  className="reportsDownload ghost"
                  onClick={() => downloadMutation.mutate({ report: r, format: 'xlsx' })}
                  disabled={busy}
                >
                  <Download size={16} /> Excel
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="tipBar">
        <p>
          <b>Note:</b> Realized and tax/digest reports filter by trade <i>exit</i> date.
          Open positions always show the latest fetched price. If a symbol has no quote yet,
          its current price shows the last cached EOD close.
        </p>
      </div>
    </div>
  )
}
