import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Radar, Bar } from 'react-chartjs-2'
import { api } from '../lib/api'
import { useAccount } from '../components/AccountContext'
import { formatCurrency, formatPct } from '../lib/format'

function severityClass(sev: 'good' | 'warning' | 'info') {
  if (sev === 'good') return 'status-ok'
  if (sev === 'warning') return 'status-warning'
  return 'status-info'
}

// Helper to read CSS variables for charts
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function AiCoachPage() {
  const { currentAccount } = useAccount()
  const { data: insightsData, isLoading: insightsLoading, error: insightsError, refetch: refetchInsights, isFetching: isFetchingInsights } = useQuery({
    queryKey: ['insights', currentAccount?.id],
    queryFn: () => api.insights(currentAccount?.id ?? 1),
  })

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['psychologySummary', currentAccount?.id],
    queryFn: () => api.psychologySummary(currentAccount?.id ?? 1),
  })

  const radarData = useMemo(() => {
    if (!summary || summary.length === 0) return null
    return {
      labels: summary.map(r => r.state),
      datasets: [
        {
          label: 'Frequency',
          data: summary.map(r => r.count),
          backgroundColor: 'rgba(56,189,248,0.2)',
          borderColor: '#38bdf8',
          borderWidth: 2,
          pointBackgroundColor: '#38bdf8',
        }
      ]
    }
  }, [summary])

  const impactData = useMemo(() => {
    if (!summary || summary.length === 0) return null
    return {
      labels: summary.map(r => r.state),
      datasets: [
        {
          label: 'Avg PnL',
          data: summary.map(r => r.avg_pnl),
          backgroundColor: summary.map(r => (r.avg_pnl ?? 0) >= 0 ? 'rgba(16,185,129,0.5)' : 'rgba(244,63,94,0.5)'),
          borderColor: summary.map(r => (r.avg_pnl ?? 0) >= 0 ? '#10b981' : '#f43f5e'),
          borderWidth: 1,
        }
      ]
    }
  }, [summary])

  const coachVerdict = useMemo(() => {
    if (!summary || summary.length === 0) return null

    const worstState = [...summary].sort((a, b) => (a.avg_pnl ?? 0) - (b.avg_pnl ?? 0))[0]
    const bestState = [...summary].sort((a, b) => (b.avg_pnl ?? 0) - (a.avg_pnl ?? 0))[0]

    const insights = []

    if (worstState && (worstState.avg_pnl ?? 0) < 0) {
      insights.push({
        title: `Stop trading when ${worstState.state}`,
        detail: `Your average PnL is ${formatCurrency(worstState.avg_pnl ?? 0)} when feeling ${worstState.state}. This is your biggest performance leak.`,
        severity: 'warning' as const
      })
    }

    if (bestState && (bestState.avg_pnl ?? 0) > 0) {
      insights.push({
        title: `Your edge is ${bestState.state}`,
        detail: `You perform best when you are ${bestState.state}, with an average win rate of ${formatPct(bestState.win_rate ?? 0)}.`,
        severity: 'good' as const
      })
    }

    return insights
  }, [summary])

  const isLoading = insightsLoading || summaryLoading
  const hasData = summary && summary.length > 0

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">AI Trading Coach</div>
          <div className="pageSubtitle">Data-driven performance feedback & psychological analysis</div>
        </div>
        <div className="detailsActions">
          <button className="btn btnGhost" onClick={() => refetchInsights()} disabled={isFetchingInsights}>
            {isFetchingInsights ? 'Refreshing…' : 'Refresh Insights'}
          </button>
        </div>
      </div>

      {isLoading && <div className="muted" style={{ textAlign: 'center', padding: '40px 0' }}><div className="spinner" style={{ margin: '0 auto 10px' }} /> Analyzing your performance…</div>}

      {!isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Top Row: Visualizations */}
          {hasData ? (
            <div className="grid panels" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
              <div className="card panel">
                <div className="panelTitle">Emotional Balance</div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>Distribution of logged emotional states</div>
                <div style={{ height: 300 }}>
                  <Radar
                    data={radarData!}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        r: {
                          angleLines: { color: cssVar('--border', 'rgba(148,163,184,0.1)') },
                          grid: { color: cssVar('--border', 'rgba(148,163,184,0.1)') },
                          pointLabels: { color: cssVar('--muted2', '#94a3b8'), font: { size: 11 } },
                          ticks: { display: false }
                        }
                      },
                      plugins: { legend: { display: false } }
                    }}
                  />
                </div>
              </div>

              <div className="card panel">
                <div className="panelTitle">Performance Impact</div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>Average PnL per emotional state</div>
                <div style={{ height: 300 }}>
                  <Bar
                    data={impactData!}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { display: false }, ticks: { color: cssVar('--muted', '#64748b') } },
                        y: { grid: { color: cssVar('--border', 'rgba(148,163,184,0.06)') }, ticks: { color: cssVar('--muted', '#64748b') } }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="card panel" style={{ textAlign: 'center', padding: '40px' }}>
              <div className="panelTitle">Insufficient Data</div>
              <div className="muted">Log more psychology entries and link them to closed trades to see emotional analytics.</div>
            </div>
          )}

          {/* Bottom Section: Insights & Verdicts */}
          <div className="sectionTitle">Coach's Verdict</div>
          <div className="grid panels">
            {/* Automatic Data-Driven Insights */}
            {coachVerdict?.map((v, i) => (
              <div key={`verdict-${i}`} className={`riskBanner ${severityClass(v.severity)}`}>
                <div className="riskBannerTitle">{v.title}</div>
                <div className="riskBannerBody muted">{v.detail}</div>
              </div>
            ))}

            {/* Static/AI Insights from Backend */}
            {(insightsData?.insights ?? []).map((c, idx) => (
              <div key={`insight-${idx}`} className={`riskBanner ${severityClass(c.severity)}`}>
                <div className="riskBannerTitle">{c.title}</div>
                <div className="riskBannerBody muted">{c.detail}</div>
              </div>
            ))}

            {!isLoading && !hasData && (insightsData?.insights ?? []).length === 0 && (
              <div className="card panel span2">
                <div className="muted">No specific insights yet. Keep journaling your trades to unlock personalized coaching.</div>
              </div>
            )}
          </div>

        </div>
      )}

      {insightsError && <div className="error" style={{ marginTop: 20 }}>Failed to load insights. Ensure the API is running on port 8001.</div>}
    </div>
  )
}


