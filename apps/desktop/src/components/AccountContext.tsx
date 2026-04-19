import React, { createContext, useContext, useState, useEffect } from 'react'
import { api, type Account } from '../lib/api'

interface AccountContextType {
  accounts: Account[]
  currentAccount: Account | null
  setCurrentAccount: (acc: Account) => void
  isLoading: boolean
  refreshAccounts: () => Promise<void>
}

const AccountContext = createContext<AccountContextType | undefined>(undefined)

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [currentAccount, setCurrentAccountState] = useState<Account | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshAccounts = async () => {
    try {
      const data = await api.listAccounts()
      setAccounts(data)
      
      // Try to restore from localStorage
      const savedId = localStorage.getItem('lastAccountId')
      if (savedId) {
        const found = data.find(a => a.id === Number(savedId))
        if (found) {
          setCurrentAccountState(found)
        } else if (data.length > 0) {
          setCurrentAccountState(data[0])
        }
      } else if (data.length > 0) {
        setCurrentAccountState(data[0])
      }
    } catch (err) {
      console.error('Failed to load accounts', err)
    } finally {
      setIsLoading(false)
    }
  }

  const setCurrentAccount = (acc: Account) => {
    setCurrentAccountState(acc)
    localStorage.setItem('lastAccountId', String(acc.id))
  }

  useEffect(() => {
    refreshAccounts()
  }, [])

  return (
    <AccountContext.Provider value={{ accounts, currentAccount, setCurrentAccount, isLoading, refreshAccounts }}>
      {children}
    </AccountContext.Provider>
  )
}

export function useAccount() {
  const context = useContext(AccountContext)
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider')
  }
  return context
}
