import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { DashboardPage } from './pages/DashboardPage'
import { JournalPage } from './pages/JournalPage'
import { CalendarPage } from './pages/CalendarPage'
import { SymbolsPage } from './pages/SymbolsPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AiCoachPage } from './pages/AiCoachPage'
import { RiskPage } from './pages/RiskPage'
import { SettingsPage } from './pages/SettingsPage'
import { StockFundamentalsPage } from './pages/StockFundamentalsPage'
import { TechnicalAnalysisPage } from './pages/TechnicalAnalysisPage'
import { SmartMoneyPage } from './pages/SmartMoneyPage'
import { CashPage } from './pages/CashPage'

export default function App() {
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
          <Route path="/coach" element={<AiCoachPage />} />
          <Route path="/risk" element={<RiskPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
