import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="emptyState">
      {icon && <div className="icon">{icon}</div>}
      <div className="title">{title}</div>
      {subtitle && <div className="subtitle">{subtitle}</div>}
      {action}
    </div>
  )
}
