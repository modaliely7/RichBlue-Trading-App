import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Info, Activity } from 'lucide-react'
import { api } from '../lib/api'
import { formatCurrency, formatPct } from '../lib/format'
import { useAccount } from '../components/AccountContext'

function SeverityIcon({ severity }: { severity: 'warning' | 'good' | 'info' }) {
  if (severity === 'warning') return <AlertTriangle size={18} style={{ color: 'var(--bad, #f43f5e)' }} />
  if (severity === 'good') return <CheckCircle2 size={18} style={{ color: 'var(--good, #10b981)' }} />
  return <Info size={18} style={{ color: 'var(--muted2)' }} />
}

function fmtR(v: number | null): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`
}

export function InsightsPage() {
  const { currentAccount } = useAccount()
  const accountId = currentAccount?.id ?? 1
  const { data, isLoading, error } = useQuery({
    queryKey: ['insights', accountId],
    queryFn: () => api.getInsights(accountId),
  })

  if (isLoading) return <div className="page"><div className="muted">Loading…</div></div>
  if (error) return <div className="page"><div className="error">Failed to load insights. Start the API server.</div></div>
  if (!data) return null

  const empty = data.summary.closed_count === 0
  const planAcc = data.plan_accuracy
  const planDrift = planAcc?.drift ?? null
  const planAdherence = planAcc?.pct_meeting_plan ?? null

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Behavior Insights</div>
          <div className="pageSubtitle">
            Rule-based patterns from your closed trades — playbook, emotion, R-multiple, and process grade
          </div>
        </div>
      </div>

      {empty ? (
        <div className="emptyState">
          <div className="icon"><Activity size={32} /></div>
          <div className="title">No closed trades yet</div>
          <div className="subtitle">
            Close a few trades (with playbook tags and emotions) to surface behavior insights.
          </div>
        </div>
      ) : null}

      {!empty && (
        <>
          <div className="formGrid" style={{ marginBottom: 12 }}>
            <div className="card panel">
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Closed trades</div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700 }}>{data.summary.closed_count}</div>
              <div className="muted" style={{ fontSize: 12 }}>of {data.summary.trade_count} total</div>
            </div>
            <div className="card panel">
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Plan adherence</div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700 }}>
                {planAdherence == null ? '—' : `${planAdherence.toFixed(0)}%`}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {planAcc == null ? 'Tag trades with r_plan to track' : `of ${planAcc.trade_count} with plans`}
              </div>
            </div>
            <div className="card panel">
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Plan vs actual drift</div>
              <div
                className="mono"
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: planDrift == null ? 'var(--text)' : planDrift >= 0 ? 'var(--good, #10b981)' : 'var(--bad, #f43f5e)',
                }}
              >
                {planDrift == null ? '—' : `${planDrift >= 0 ? '+' : ''}${planDrift.toFixed(2)}R`}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {planAcc == null ? '—' : `plan ${planAcc.avg_plan?.toFixed(2)}R · actual ${planAcc.avg_actual?.toFixed(2)}R`}
              </div>
            </div>
            <div className="card panel">
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Insights</div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700 }}>{data.insights.length}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {data.insights.filter((i) => i.severity === 'warning').length} warnings ·{' '}
                {data.insights.filter((i) => i.severity === 'good').length} positives
              </div>
            </div>
          </div>

          {data.insights.length > 0 && (
            <div className="card panel" style={{ marginBottom: 12 }}>
              <div className="panelTitle">Top insights</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {data.insights.map((ins, idx) => (
                  <div
                    key={idx}
                    className="insightRow"
                    data-severity={ins.severity}
                  >
                    <SeverityIcon severity={ins.severity} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{ins.title}</span>
                        <span className="statusPill">{ins.category}</span>
                        {ins.sample_size != null && (
                          <span className="muted" style={{ fontSize: 11 }}>n={ins.sample_size}</span>
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{ins.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="formGrid" style={{ marginBottom: 12 }}>
            <div className="card panel span2">
              <div className="panelTitle">Emotion × R-multiple</div>
              {data.emotions.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>No trades with pre-trade emotion tagged.</div>
              ) : (
                <div className="tableWrap" style={{ marginTop: 8 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Emotion</th>
                        <th>Trades</th>
                        <th>Win rate</th>
                        <th>Avg R</th>
                        <th>Total PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.emotions.map((e) => (
                        <tr key={e.emotion}>
                          <td>{e.emotion}</td>
                          <td className="mono">{e.trade_count}</td>
                          <td className="mono">{e.win_rate == null ? '—' : formatPct(e.win_rate)}</td>
                          <td className={`mono ${e.avg_r_multiple == null ? '' : e.avg_r_multiple >= 0 ? 'good' : 'bad'}`}>
                            {fmtR(e.avg_r_multiple)}
                          </td>
                          <td className={`mono ${e.total_pnl >= 0 ? 'good' : 'bad'}`}>
                            {formatCurrency(e.total_pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card panel span2">
              <div className="panelTitle">Playbook performance</div>
              {data.playbooks.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>No closed trades yet.</div>
              ) : (
                <div className="tableWrap" style={{ marginTop: 8 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Playbook</th>
                        <th>Trades</th>
                        <th>Win rate</th>
                        <th>Avg R</th>
                        <th>Avg process</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.playbooks.map((p) => (
                        <tr key={p.playbook_id ?? 'untagged'}>
                          <td>
                            <div style={{ color: 'var(--text)' }}>{p.playbook_name}</div>
                            {p.setup_names.length > 0 && (
                              <div className="muted" style={{ fontSize: 11 }}>{p.setup_names.join(' · ')}</div>
                            )}
                          </td>
                          <td className="mono">{p.trade_count}</td>
                          <td className="mono">{p.win_rate == null ? '—' : formatPct(p.win_rate)}</td>
                          <td className={`mono ${p.avg_r_multiple == null ? '' : p.avg_r_multiple >= 0 ? 'good' : 'bad'}`}>
                            {fmtR(p.avg_r_multiple)}
                          </td>
                          <td className="mono">{p.avg_process_grade == null ? '—' : p.avg_process_grade.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {data.setups.length > 0 && (
            <div className="card panel" style={{ marginBottom: 12 }}>
              <div className="panelTitle">Setup performance</div>
              <div className="tableWrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Setup</th>
                      <th>Playbook</th>
                      <th>Trades</th>
                      <th>Win rate</th>
                      <th>Avg R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.setups.map((s) => (
                      <tr key={s.setup_id ?? 'no-setup'}>
                        <td>{s.setup_name}</td>
                        <td className="muted">{s.playbook_name ?? '—'}</td>
                        <td className="mono">{s.trade_count}</td>
                        <td className="mono">{s.win_rate == null ? '—' : formatPct(s.win_rate)}</td>
                        <td className={`mono ${s.avg_r_multiple == null ? '' : s.avg_r_multiple >= 0 ? 'good' : 'bad'}`}>
                          {fmtR(s.avg_r_multiple)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.process_grades.length > 0 && (
            <div className="card panel">
              <div className="panelTitle">Process grade distribution</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
                {data.process_grades.map((g) => {
                  const max = Math.max(...data.process_grades.map((x) => x.trade_count), 1)
                  const heightPct = (g.trade_count / max) * 100
                  return (
                    <div key={g.grade} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {g.avg_r_multiple == null ? '—' : fmtR(g.avg_r_multiple)}
                        </div>
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.max(8, heightPct)}px`,
                            minHeight: 8,
                            maxHeight: 120,
                            background:
                              g.avg_r_multiple == null
                                ? 'var(--muted2)'
                                : g.avg_r_multiple >= 0
                                ? 'var(--good, #10b981)'
                                : 'var(--bad, #f43f5e)',
                            borderRadius: 4,
                            transition: 'height 0.2s ease',
                          }}
                        />
                        <div style={{ fontSize: 12, color: 'var(--text)' }}>{'★'.repeat(g.grade)}</div>
                        <div className="muted" style={{ fontSize: 11 }}>n={g.trade_count}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {data.insights.length === 0 && (
            <div className="card panel">
              <div className="muted" style={{ textAlign: 'center', padding: 16 }}>
                <CheckCircle2 size={20} style={{ color: 'var(--good, #10b981)', marginBottom: 6 }} />
                <div>No patterns triggered yet — close more trades or tag emotions/playbooks to surface insights.</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
