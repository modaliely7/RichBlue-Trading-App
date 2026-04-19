import type { ReactNode } from 'react'

export function KpiCard(props: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'neutral'; tooltip?: string }) {
  const toneClass = props.tone ? `tone-${props.tone}` : ''
  return (
    <div className={`card kpi ${toneClass}`} title={props.tooltip ?? undefined}>
      <div className="kpiLabel">{props.label}</div>
      <div className="kpiValue">{props.value}</div>
      {props.sub ? <div className="kpiSub">{props.sub}</div> : null}
    </div>
  )
}

