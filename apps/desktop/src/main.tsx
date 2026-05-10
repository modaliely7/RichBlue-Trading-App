import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { AccountProvider } from './components/AccountContext'
import App from './App.tsx'
import './lib/charts'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </AccountProvider>
    </QueryClientProvider>
  </StrictMode>,
)
