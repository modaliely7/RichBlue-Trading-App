import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
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
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AccountProvider>
    </QueryClientProvider>
  </StrictMode>,
)
