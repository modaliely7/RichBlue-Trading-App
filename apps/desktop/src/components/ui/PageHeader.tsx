import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="pageHeaderRow">
      <div className="pageHeaderText">
        {typeof title === 'string' ? <h1 className="h1">{title}</h1> : title}
        {subtitle && <p className="muted text-md">{subtitle}</p>}
      </div>
      {actions && <div className="pageHeaderActions">{actions}</div>}
    </div>
  )
}
