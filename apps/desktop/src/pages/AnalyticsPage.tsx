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
    mutationFn: () =>
      api.exportReportPdf({
        account_id: currentAccount?.id ?? 1,
        start: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined,
        end: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
      }),
  })

  const excel = useMutation({
    mutationFn: () =>
      api.exportReportExcel({
        account_id: currentAccount?.id ?? 1,
        start: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined,
        end: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
      }),
  })

  const monthChart = useMemo(() => {
    const rows = data?.by_month ?? []
    const labels = rows.map((r) => r.key)
    const values = rows.map((r) => r.total)
    return { labels, values }
  }, [data])

  const adv: any = data?.advanced ?? {}

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
            {pdf.isPending ? 'Preparing PDF…' : 'PDF Report'}
          </button>
          <button
            className="btn"
            disabled={excel.isPending}
            onClick={async () => {
              const blob = await excel.mutateAsync()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `performance_data_${new Date().toISOString().slice(0, 10)}.xlsx`
              document.body.appendChild(a)
              a.click()
              a.remove()
              setTimeout(() => URL.revokeObjectURL(url), 2000)
            }}
          >
            {excel.isPending ? 'Preparing Excel…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load analytics. Start the API server.</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div className="mainCol">
          {data ? (
            <>
              <div className="grid kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div className="card kpi">
                  <div className="kpiLabel">Win Rate</div>
                  <div className="kpiValue good">{formatPct(adv.win_rate)}</div>
                  <div className="kpiSub">{adv.win_count} Wins / {adv.loss_count} Losses</div>
                </div>
                <div className="card kpi">
                  <div className="kpiLabel">Profit Factor</div>
                  <div className={`kpiValue ${adv.profit_factor >= 1.5 ? 'good' : adv.profit_factor >= 1 ? 'warn' : 'bad'}`}>
                    {adv.profit_factor === Infinity ? '∞' : adv.profit_factor?.toFixed(2)}
                  </div>
                  <div className="kpiSub">Gross Win / Gross Loss</div>
                </div>
                <div className="card kpi">
                  <div className="kpiLabel">Avg Win / Loss</div>
                  <div className="kpiValue">
                    <span className="good" style={{ fontSize: 18 }}>{formatCurrency(adv.avg_win_amount)}</span>
                    <span style={{ margin: '0 8px', color: 'var(--muted)' }}>/</span>
                    <span className="bad" style={{ fontSize: 18 }}>{formatCurrency(adv.avg_loss_amount)}</span>
                  </div>
                  <div className="kpiSub">Typical trade outcome</div>
                </div>
                <div className="card kpi">
                  <div className="kpiLabel">Max Win / Loss</div>
                  <div className="kpiValue">
                    <span className="good" style={{ fontSize: 18 }}>{formatCurrency(adv.max_win_amount)}</span>
                    <span style={{ margin: '0 8px', color: 'var(--muted)' }}>/</span>
                    <span className="bad" style={{ fontSize: 18 }}>{formatCurrency(adv.max_loss_amount)}</span>
                  </div>
                  <div className="kpiSub">Extremes recorded</div>
                </div>
                <div className="card kpi">
                  <div className="kpiLabel">Avg Risk Reward</div>
                  <div className="kpiValue">{adv.avg_risk_reward?.toFixed(2)}:1</div>
                  <div className="kpiSub">Average target RR</div>
                </div>
                <div className="card kpi">
                  <div className="kpiLabel">Total Net PnL</div>
                  <div className={`kpiValue ${data.overall.total >= 0 ? 'good' : 'bad'}`}>{formatCurrency(data.overall.total)}</div>
                  <div className="kpiSub">{data.closed_trades} trades total</div>
                </div>
              </div>

              <div className="card panel" style={{ marginTop: 20 }}>
                <div className="panelTitle">Monthly Performance History</div>
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
                        x: { ticks: { color: 'var(--muted2)' }, grid: { color: 'var(--border)' } },
                        y: { ticks: { color: 'var(--muted2)' }, grid: { color: 'var(--border)' } },
                      },
                    }}
                  />
                </div>
              </div>

              <div className="grid panels" style={{ marginTop: 20 }}>
                <Table title="Market Performance" rows={data?.by_market ?? []} />
              </div>

              <div style={{ marginTop: 20 }}>
                <Table title="Strategy Breakdown" rows={data?.by_strategy ?? []} />
              </div>
            </>
          ) : null}
        </div>

        <div className="sideCol">
          <div className="sectionTitle">Highlights</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TopCard title="Top Strategy" row={data?.best_strategy ?? null} />
            <TopCard title="Bottom Strategy" row={data?.worst_strategy ?? null} />
            <TopCard title="Best Day" row={data?.best_day ?? null} />
            <TopCard title="Best Hour" row={data?.best_hour ?? null} />
          </div>

          <div className="sectionTitle" style={{ marginTop: 30 }}>Time Analysis</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Table title="By Day of Week" rows={data?.by_day_of_week ?? []} />
            <Table title="By Hour of Day" rows={data?.by_hour ?? []} />
          </div>
        </div>
      </div>
    </div>
  )
}

