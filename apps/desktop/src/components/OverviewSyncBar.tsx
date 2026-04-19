import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type OverviewResponse } from '../lib/api'

export function OverviewSyncBar() {
  const qc = useQueryClient()
  const { data: ov, isFetching } = useQuery<OverviewResponse>({
    queryKey: ['overview'],
    queryFn: () => api.overview(),
  })

  return (
    <>
      <div className="statusPill">
        As of:{' '}
        <span className="mono">{ov?.kpis.as_of ? new Date(ov.kpis.as_of).toLocaleString() : '—'}</span>
      </div>
      <button
        type="button"
        className="btn btnGhost"
        disabled={isFetching}
        onClick={() => void qc.invalidateQueries({ queryKey: ['overview'] })}
      >
        {isFetching ? 'Refreshing…' : 'Refresh'}
      </button>
    </>
  )
}
