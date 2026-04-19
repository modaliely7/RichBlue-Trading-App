import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type OverviewResponse } from '../lib/api'
import { useAccount } from './AccountContext'

export function OverviewSyncBar() {
  const { currentAccount } = useAccount()
  const qc = useQueryClient()
  const { data: ov, isFetching } = useQuery<OverviewResponse>({
    queryKey: ['overview', currentAccount?.id],
    queryFn: () => api.overview(currentAccount?.id ?? 1),
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
        onClick={() => void qc.invalidateQueries({ queryKey: ['overview', currentAccount?.id] })}
      >
        {isFetching ? 'Refreshing…' : 'Refresh'}
      </button>
    </>
  )
}
