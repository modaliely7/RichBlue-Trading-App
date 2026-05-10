export function formatCurrency(n: number | null | undefined, currency = 'USD') {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(2)}%`
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return '—'
  const mins = Math.floor(seconds / 60)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (days > 0) return `${days}d ${hrs % 24}h`
  if (hrs > 0) return `${hrs}h ${mins % 60}m`
  if (mins > 0) return `${mins}m`
  return `${seconds}s`
}

