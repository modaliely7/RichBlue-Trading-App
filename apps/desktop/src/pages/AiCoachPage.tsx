import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

function severityClass(sev: 'good' | 'warning' | 'info') {
  if (sev === 'good') return 'status-ok'
  if (sev === 'warning') return 'status-warning'
  return 'status-info'
}

export function AiCoachPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['insights'],
    queryFn: api.insights,
  })

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">AI Trading Coach</div>
          <div className="pageSubtitle">Deterministic insights from your journal (local-first)</div>
        </div>
        <div className="detailsActions">
          <button className="btn btnGhost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load insights. Start the API server.</div> : null}

      <div className="grid panels">
        {(data?.insights ?? []).map((c, idx) => (
          <div key={idx} className={`riskBanner ${severityClass(c.severity)}`}>
            <div className="riskBannerTitle">{c.title}</div>
            <div className="riskBannerBody muted">{c.detail}</div>
          </div>
        ))}

        {(data?.insights ?? []).length === 0 && !isLoading ? (
          <div className="card panel">
            <div className="muted">No insights available.</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

