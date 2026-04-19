type Tone = 'good' | 'bad' | 'neutral' | undefined

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  tone?: Tone
  tooltip?: string
}

export function KpiCard({ label, value, sub, tone, tooltip }: KpiCardProps) {
  const toneClass = tone ? `tone-${tone}` : ''
  return (
    <div className={`card kpi ${toneClass}`} title={tooltip}>
      <div className="kpiLabel">{label}</div>
      <div className="kpiValue">{value}</div>
      {sub && <div className="kpiSub">{sub}</div>}
    </div>
  )
}
