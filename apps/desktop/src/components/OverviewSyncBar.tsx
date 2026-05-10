import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type OverviewResponse } from '../lib/api'
import { useAccount } from './AccountContext'

export function OverviewSyncBar() {
  const qc = useQueryClient()
  const { currentAccount } = useAccount()
  const accountId = currentAccount?.id ?? 1

  const { data: ov, isFetching } = useQuery<OverviewResponse>({
    queryKey: ['overview', accountId],
    queryFn: () => api.overview(accountId),
  })

  const handleRefresh = () => {
    void Promise.all([
      qc.invalidateQueries({ queryKey: ['overview', accountId] }),
      qc.invalidateQueries({ queryKey: ['cashBalance', accountId] }),
      qc.invalidateQueries({ queryKey: ['cashTransactions', accountId] }),
    ])
  }

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
        onClick={handleRefresh}
      >
        {isFetching ? 'Refreshing…' : 'Refresh'}
      </button>
    </>
  )
}
