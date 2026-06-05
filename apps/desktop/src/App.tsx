import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { DashboardPage } from './pages/DashboardPage'
import { JournalPage } from './pages/JournalPage'
import { CalendarPage } from './pages/CalendarPage'
import { SymbolsPage } from './pages/SymbolsPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { CalculatorsPage } from './pages/CalculatorsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ReportsPage } from './pages/ReportsPage'
import { CashPage } from './pages/CashPage'
import { StrategiesPage } from './pages/StrategiesPage'
import { PlaybooksPage } from './pages/PlaybooksPage'
import { AddTradePage } from './pages/AddTradePage'
import { DataPage } from './pages/DataPage'
import { PsychologyPage } from './pages/PsychologyPage'
import { LessonsPage } from './pages/LessonsPage'
import { applyChartTheme } from './lib/charts'
import { useTheme } from './context/ThemeContext'

export default function App() {
  const { theme } = useTheme()

  useEffect(() => {
    // Apply zoom on mount
    const savedZoom = localStorage.getItem('ui-zoom') || '100'
    document.documentElement.style.setProperty('--ui-zoom', `${savedZoom}%`)
  }, [])

  useEffect(() => {
    applyChartTheme(theme)
  }, [theme])

  return (
    <div className="appShell">
      <Sidebar />
      <Topbar />
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/trades" element={<JournalPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/symbols" element={<SymbolsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/cash" element={<CashPage />} />
          <Route path="/strategies" element={<StrategiesPage />} />
          <Route path="/playbooks" element={<PlaybooksPage />} />
          <Route path="/psychology" element={<PsychologyPage />} />
          <Route path="/lessons" element={<LessonsPage />} />
          <Route path="/trades/add" element={<AddTradePage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/calculators" element={<CalculatorsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
