import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { AccountProvider } from './components/AccountContext'
import { ThemeProvider } from './context/ThemeContext'
import App from './App.tsx'
import './lib/charts'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AccountProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </AccountProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
