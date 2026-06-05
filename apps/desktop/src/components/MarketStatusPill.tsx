import { useQuery } from '@tanstack/react-query'
import { api, type MarketStatus } from '../lib/api'

interface Props {
  refreshIntervalMs?: number
}

export function MarketStatusPill({ refreshIntervalMs = 60_000 }: Props) {
  const { data, isLoading, error } = useQuery<MarketStatus>({
    queryKey: ['market-status'],
    queryFn: () => api.getMarketStatus(),
    refetchInterval: refreshIntervalMs,
    staleTime: 30_000,
  })

  if (isLoading) {
    return <div className="marketStatusPill marketStatusLoading">EGX …</div>
  }
  if (error || !data) {
    return <div className="marketStatusPill marketStatusError">EGX • Offline</div>
  }

  const cls = data.is_market_open ? 'marketStatusOpen' : 'marketStatusClosed'
  return (
    <div
      className={`marketStatusPill ${cls}`}
      title={
        data.last_refresh_at
          ? `Last refresh: ${new Date(data.last_refresh_at).toLocaleString()}`
          : 'No refresh yet'
      }
    >
      <span className="marketStatusDot" />
      EGX • {data.session_label}
    </div>
  )
}
