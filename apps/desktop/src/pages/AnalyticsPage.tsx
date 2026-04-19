import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import { api } from '../lib/api'
import type { PerfRow } from '../lib/api'
import { formatCurrency, formatPct } from '../lib/format'
import { useAccount } from '../components/AccountContext'

function TopCard(props: { title: string; row: PerfRow | null }) {
  const r = props.row
  return (
    <div className="card panel">
      <div className="panelTitle">{props.title}</div>
      {r ? (
        <div>
          <div className="detailsLine">
            <span className="mono">{r.key}</span>
          </div>
          <div className="detailsLine">
            <span className="muted">Trades:</span> <span className="mono">{r.count}</span>
            <span className="muted" style={{ marginLeft: 10 }}>
              Avg:
            </span>{' '}
            <span className={r.avg >= 0 ? 'good' : 'bad'}>{formatCurrency(r.avg)}</span>
          </div>
          <div className="detailsLine">
            <span className="muted">Total:</span> <span className={r.total >= 0 ? 'good' : 'bad'}>{formatCurrency(r.total)}</span>
            <span className="muted" style={{ marginLeft: 10 }}>
              Win rate:
            </span>{' '}
            <span>{formatPct(r.win_rate)}</span>
          </div>
        </div>
      ) : (
        <div className="muted">Not enough data yet (need at least 3 trades).</div>
      )}
    </div>
  )
}

function Table(props: { title: string; rows: PerfRow[] }) {
  return (
    <div className="card panel">
      <div className="panelTitle">{props.title}</div>
      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Trades</th>
              <th>Total</th>
              <th>Avg</th>
              <th>Win rate</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.slice(0, 20).map((r) => (
              <tr key={r.key}>
                <td className="mono">{r.key}</td>
                <td className="mono">{r.count}</td>
                <td className={r.total >= 0 ? 'good' : 'bad'}>{formatCurrency(r.total)}</td>
                <td className={r.avg >= 0 ? 'good' : 'bad'}>{formatCurrency(r.avg)}</td>
                <td>{formatPct(r.win_rate)}</td>
              </tr>
            ))}
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No data yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AnalyticsPage() {
  const { currentAccount } = useAccount()
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['performanceAnalytics', currentAccount?.id, startDate, endDate],
    queryFn: () =>
      api.performanceAnalytics({
        account_id: currentAccount?.id ?? 1,
        start: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined,
        end: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
      }),
  })

  const pdf = useMutation({
    mutationFn: () => api.downloadPerformancePdf(currentAccount?.id ?? 1),
  })

  const monthChart = useMemo(() => {
    const rows = data?.by_month ?? []
    const labels = rows.map((r) => r.key)
    const values = rows.map((r) => r.total)
    return { labels, values }
  }, [data])

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Performance Analytics</div>
          <div className="pageSubtitle">Strategy & time-based breakdowns (computed from closed trades)</div>
        </div>
        <div className="detailsActions">
          <label className="muted">
            <span style={{ marginRight: 8 }}>From</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="muted">
            <span style={{ marginRight: 8 }}>To</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <button
            className="btn btnGhost"
            disabled={pdf.isPending}
            onClick={async () => {
              const blob = await pdf.mutateAsync()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `performance_report_${new Date().toISOString().slice(0, 10)}.pdf`
              document.body.appendChild(a)
              a.click()
              a.remove()
              setTimeout(() => URL.revokeObjectURL(url), 2000)
            }}
          >
            {pdf.isPending ? 'Preparing PDF…' : 'Download PDF report'}
          </button>
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load analytics. Start the API server.</div> : null}
      {pdf.error ? <div className="error">Failed to generate PDF report.</div> : null}

      {data ? (
        <div className="grid kpis">
          <div className="card kpi">
            <div className="kpiLabel">Closed trades used</div>
            <div className="kpiValue">{data.closed_trades}</div>
          </div>
          <div className="card kpi tone-good">
            <div className="kpiLabel">Overall Avg PnL</div>
            <div className="kpiValue">{formatCurrency(data.overall.avg)}</div>
          </div>
          <div className="card kpi">
            <div className="kpiLabel">Overall Win Rate</div>
            <div className="kpiValue">{formatPct(data.overall.win_rate)}</div>
          </div>
          <div className="card kpi">
            <div className="kpiLabel">Overall Total</div>
            <div className={`kpiValue ${data.overall.total >= 0 ? 'good' : 'bad'}`}>{formatCurrency(data.overall.total)}</div>
          </div>
        </div>
      ) : null}

      <div className="grid panels" style={{ marginTop: 12 }}>
        <TopCard title="Best performing strategy" row={data?.best_strategy ?? null} />
        <TopCard title="Worst strategy" row={data?.worst_strategy ?? null} />
        <TopCard title="Best trading day" row={data?.best_day ?? null} />
        <TopCard title="Worst trading day" row={data?.worst_day ?? null} />
        <TopCard title="Best trading hour" row={data?.best_hour ?? null} />
        <TopCard title="Worst trading hour" row={data?.worst_hour ?? null} />
      </div>

      <div className="grid panels" style={{ marginTop: 12 }}>
        <div className="card panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panelTitle">Monthly PnL</div>
          {(data?.by_month?.length ?? 0) === 0 ? (
            <div className="muted">No monthly data yet.</div>
          ) : (
            <div className="chartWrapper small">
              <Bar
                data={{
                  labels: monthChart.labels,
                  datasets: [
                    {
                      label: 'PnL',
                      data: monthChart.values,
                      backgroundColor: monthChart.values.map((v) =>
                        v >= 0 ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)',
                      ) as any,
                      borderColor: monthChart.values.map((v) =>
                        v >= 0 ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)',
                      ) as any,
                      borderWidth: 1,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { maxTicksLimit: 10, color: 'rgba(148,163,184,0.9)' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                    y: { ticks: { color: 'rgba(148,163,184,0.9)' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                  },
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid panels" style={{ marginTop: 12 }}>
        <Table title="Performance by market" rows={data?.by_market ?? []} />
        <Table title="Performance by trade type" rows={data?.by_trade_type ?? []} />
        <Table title="Performance by day of week" rows={data?.by_day_of_week ?? []} />
        <Table title="Performance by hour" rows={data?.by_hour ?? []} />
        <div style={{ gridColumn: '1 / -1' }}>
          <Table title="Performance by strategy" rows={data?.by_strategy ?? []} />
        </div>
      </div>
    </div>
  )
}

