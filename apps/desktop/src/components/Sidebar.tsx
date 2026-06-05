import {
  LayoutDashboard,
  Briefcase,
  BookOpen,
  Calendar,
  CandlestickChart,
  Layers,
  Tag,
  Brain,
  BookMarked,
  TrendingUp,
  Calculator,
  ClipboardList,
  Activity,
  Database,
  Settings as SettingsIcon,
  FileText,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { ComponentType } from 'react'

interface Item {
  to: string
  label: string
  icon: ComponentType<{ size?: number }>
}

interface Section {
  title: string
  items: Item[]
}

const sections: Section[] = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
    ],
  },
  {
    title: 'Trading',
    items: [
      { to: '/trades', label: 'Trade Journal', icon: BookOpen },
      { to: '/calendar', label: 'Calendar', icon: Calendar },
      { to: '/cash', label: 'Cash & Ledger', icon: Layers },
      { to: '/symbols', label: 'Symbols', icon: CandlestickChart },
      { to: '/strategies', label: 'Strategies', icon: Tag },
      { to: '/playbooks', label: 'Playbooks', icon: ClipboardList },
      { to: '/insights', label: 'Insights', icon: Activity },
      { to: '/psychology', label: 'Psychology', icon: Brain },
      { to: '/lessons', label: 'Lessons', icon: BookMarked },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/analytics', label: 'Performance', icon: TrendingUp },
      { to: '/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    title: 'Tools',
    items: [
      { to: '/calculators', label: 'Calculators', icon: Calculator },
      { to: '/data', label: 'Data', icon: Database },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
]

export function Sidebar() {
  return (
    <aside className="sidebar">
      <nav>
        {sections.map((sec) => (
          <div key={sec.title}>
            <div className="navSection">{sec.title}</div>
            <div className="nav">
              {sec.items.map((it) => {
                const Icon = it.icon
                return (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.to === '/'}
                    className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={15} />
                    <span>{it.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="apiStatus">
        <span className="apiDot" />
        <span>v2.0.0 · Local</span>
      </div>
    </aside>
  )
}
