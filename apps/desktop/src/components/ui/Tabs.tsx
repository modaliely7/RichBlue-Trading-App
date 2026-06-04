import type { ReactNode } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'

export interface TabItem {
  id: string
  label: ReactNode
  icon?: ReactNode
  content: ReactNode
}

interface TabsProps {
  items: TabItem[]
  paramName?: string
  defaultValue?: string
}

export function Tabs({ items, paramName = 'tab', defaultValue }: TabsProps) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const activeId =
    searchParams.get(paramName) ?? defaultValue ?? items[0]?.id ?? ''

  const setActive = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set(paramName, id)
    navigate(`${location.pathname}?${params.toString()}`, { replace: true })
  }

  const active = items.find((it) => it.id === activeId) ?? items[0]

  return (
    <div className="tabs">
      <div className="tabsList" role="tablist">
        {items.map((it) => (
          <button
            key={it.id}
            role="tab"
            aria-selected={it.id === activeId}
            className={`tabsTrigger ${it.id === activeId ? 'active' : ''}`}
            onClick={() => setActive(it.id)}
          >
            {it.icon}
            {it.label}
          </button>
        ))}
      </div>
      <div className="tabsContent" role="tabpanel" key={active?.id}>
        {active?.content}
      </div>
    </div>
  )
}
