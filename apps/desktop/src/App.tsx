import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { DashboardPage } from './pages/DashboardPage'
import { JournalPage } from './pages/JournalPage'
import { CalendarPage } from './pages/CalendarPage'
import { SymbolsPage } from './pages/SymbolsPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { CalculatorsPage } from './pages/CalculatorsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StockFundamentalsPage } from './pages/StockFundamentalsPage'
import { TechnicalAnalysisPage } from './pages/TechnicalAnalysisPage'
import { SmartMoneyPage } from './pages/SmartMoneyPage'
import { CashPage } from './pages/CashPage'
import { StrategiesPage } from './pages/StrategiesPage'
import { AddTradePage } from './pages/AddTradePage'
import { DataPage } from './pages/DataPage'

export default function App() {
  useEffect(() => {
    // Apply Theme
    const savedTheme = localStorage.getItem('theme') || 'default'
    if (savedTheme !== 'default') {
      document.documentElement.setAttribute('data-theme', savedTheme)
    }
    
    // Apply Zoom
    const savedZoom = localStorage.getItem('ui-zoom') || '100'
    document.documentElement.style.setProperty('--ui-zoom', `${savedZoom}%`)
  }, [])

  return (
    <div className="appShell">
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/trades" element={<JournalPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/symbols" element={<SymbolsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/fundamentals" element={<StockFundamentalsPage />} />
          <Route path="/technical" element={<TechnicalAnalysisPage />} />
          <Route path="/smart-money" element={<SmartMoneyPage />} />
          <Route path="/cash" element={<CashPage />} />
          <Route path="/strategies" element={<StrategiesPage />} />
          <Route path="/trades/add" element={<AddTradePage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/calculators" element={<CalculatorsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
