import { formatCurrency, formatPct } from '../lib/format'

interface Props {
  pnl: number | null | undefined
  pct: number | null | undefined
  currency?: string
}

export function UnrealizedPnlCell({ pnl, pct, currency = 'USD' }: Props) {
  if (pnl == null || !Number.isFinite(pnl)) return <span className="muted">—</span>
  const positive = pnl >= 0
  return (
    <span className={`unrealizedPnlCell ${positive ? 'good' : 'bad'}`}>
      <span className="unrealizedPnlAmount">
        {positive ? '+' : ''}
        {formatCurrency(pnl, currency)}
      </span>
      {pct != null && Number.isFinite(pct) ? (
        <span className="unrealizedPnlPct">
          ({positive ? '+' : ''}
          {formatPct(pct)})
        </span>
      ) : null}
    </span>
  )
}
