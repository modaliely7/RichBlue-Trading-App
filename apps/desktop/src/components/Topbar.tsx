import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Sun,
  Moon,
  RefreshCw,
  Plus,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  TrendingUp,
  Brain,
  BookMarked,
  User,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAccount } from './AccountContext'
import { Logo } from './ui/Logo'

const ZOOM_MIN = 70
const ZOOM_MAX = 150
const ZOOM_STEP = 10

function useClickOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])
  return ref
}

export function Topbar() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { theme, setTheme } = useTheme()
  const { accounts, currentAccount, setCurrentAccount } = useAccount()

  const [openMenu, setOpenMenu] = useState<'add' | 'theme' | 'zoom' | 'account' | null>(null)
  const [zoom, setZoom] = useState<number>(() => {
    const stored = localStorage.getItem('ui-zoom')
    return stored ? parseInt(stored, 10) : 100
  })
  const [syncedAt, setSyncedAt] = useState<Date | null>(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-zoom', `${zoom}%`)
    localStorage.setItem('ui-zoom', String(zoom))
  }, [zoom])

  const addRef = useClickOutside<HTMLDivElement>(() => setOpenMenu((m) => (m === 'add' ? null : m)))
  const themeRef = useClickOutside<HTMLDivElement>(() => setOpenMenu((m) => (m === 'theme' ? null : m)))
  const zoomRef = useClickOutside<HTMLDivElement>(() => setOpenMenu((m) => (m === 'zoom' ? null : m)))
  const accountRef = useClickOutside<HTMLDivElement>(() => setOpenMenu((m) => (m === 'account' ? null : m)))

  function refresh() {
    queryClient.invalidateQueries()
    setSyncedAt(new Date())
  }

  useEffect(() => {
    setSyncedAt(new Date())
  }, [currentAccount?.id])

  const activeAccount = currentAccount
  const accountInitials = (activeAccount?.name ?? '?').slice(0, 2).toUpperCase()

  return (
    <header className="topbar">
      <a className="topbarBrand" href="#/" onClick={(e) => { e.preventDefault(); navigate('/') }}>
        <Logo size="md" />
      </a>

      <div className="topbarSearch">
        <Search size={14} className="topbarSearchIcon" />
        <input type="text" placeholder="Search trades, symbols, lessons…" />
      </div>

      <div className="topbarActions">
        {syncedAt && (
          <div className="syncPill" title={`Last refreshed: ${syncedAt.toLocaleTimeString()}`}>
            <span>As of {syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <button onClick={refresh} aria-label="Refresh">
              <RefreshCw size={12} />
            </button>
          </div>
        )}

        <div className="themeToggle" ref={themeRef}>
          <button
            className="topbarIconBtn"
            onClick={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
            aria-label="Theme"
            title="Theme"
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          {openMenu === 'theme' && (
            <div className="themeToggleMenu">
              <button
                className={`themeOption ${theme === 'light' ? 'active' : ''}`}
                onClick={() => { setTheme('light'); setOpenMenu(null) }}
              >
                <div className="themeSwatch">
                  <div className="themeSwatchLight" style={{ flex: 1 }} />
                </div>
                Light
              </button>
              <button
                className={`themeOption ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => { setTheme('dark'); setOpenMenu(null) }}
              >
                <div className="themeSwatch">
                  <div className="themeSwatchDark" style={{ flex: 1 }} />
                </div>
                Dark
              </button>
            </div>
          )}
        </div>

        <div className="zoomMenu" ref={zoomRef}>
          <button
            className="topbarIconBtn"
            onClick={() => setOpenMenu(openMenu === 'zoom' ? null : 'zoom')}
            aria-label="Zoom"
            title="Zoom"
          >
            <ZoomIn size={16} />
          </button>
          {openMenu === 'zoom' && (
            <div className="zoomMenuItems">
              <button
                onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
                aria-label="Zoom out"
                disabled={zoom <= ZOOM_MIN}
              >
                <ZoomOut size={12} />
              </button>
              <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={5}
                value={zoom}
                onChange={(e) => setZoom(parseInt(e.target.value, 10))}
              />
              <button
                onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
                aria-label="Zoom in"
                disabled={zoom >= ZOOM_MAX}
              >
                <ZoomIn size={12} />
              </button>
              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 32, textAlign: 'right' }}>{zoom}%</span>
            </div>
          )}
        </div>

        <div className="accountMenu" ref={accountRef}>
          <button
            className="accountPill"
            onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
          >
            <span className="accountPillAvatar">{accountInitials}</span>
            <span>{activeAccount?.name ?? 'Account'}</span>
            <ChevronDown size={12} />
          </button>
          {openMenu === 'account' && (
            <div className="accountMenuItems">
              <div className="quickAddMenuLabel">Switch Account</div>
              {accounts.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: 'var(--muted)' }}>
                  No accounts yet
                </div>
              ) : (
                accounts.map((a) => (
                  <button
                    key={a.id}
                    className={`themeOption ${a.id === currentAccount?.id ? 'active' : ''}`}
                    onClick={() => { setCurrentAccount(a); setOpenMenu(null) }}
                  >
                    <User size={14} />
                    {a.name}
                  </button>
                ))
              )}
              <div className="quickAddMenuDivider" />
              <button
                className="quickAddMenuItem"
                onClick={() => { navigate('/settings?tab=accounts'); setOpenMenu(null) }}
              >
                <User size={14} className="icon" />
                Manage Accounts
              </button>
            </div>
          )}
        </div>

        <div className="quickAddWrapper" ref={addRef} style={{ position: 'relative' }}>
          <button
            className="quickAddBtn"
            onClick={() => setOpenMenu(openMenu === 'add' ? null : 'add')}
          >
            <Plus size={14} />
            <span>Add</span>
          </button>
          {openMenu === 'add' && (
            <div className="quickAddMenu">
              <div className="quickAddMenuLabel">Quick Add</div>
              <button className="quickAddMenuItem" onClick={() => { navigate('/trades/add'); setOpenMenu(null) }}>
                <TrendingUp size={14} className="icon" />
                New Trade
              </button>
              <button className="quickAddMenuItem" onClick={() => { navigate('/psychology'); setOpenMenu(null) }}>
                <Brain size={14} className="icon" />
                Log Psychology
              </button>
              <button className="quickAddMenuItem" onClick={() => { navigate('/lessons'); setOpenMenu(null) }}>
                <BookMarked size={14} className="icon" />
                Add Lesson
              </button>
              <div className="quickAddMenuDivider" />
              <button className="quickAddMenuItem" onClick={() => { navigate('/cash'); setOpenMenu(null) }}>
                <Plus size={14} className="icon" />
                Cash Transaction
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function Search(props: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
