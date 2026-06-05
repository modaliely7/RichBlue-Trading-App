import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type EgxSymbol } from '../lib/api'

interface Props {
  value: string
  onChange: (symbol: string) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  market?: string
}

export function SymbolPicker({ value, onChange, placeholder, disabled, autoFocus, market }: Props) {
  const [open, setOpen] = useState<boolean>(false)
  const [focusedIndex, setFocusedIndex] = useState<number>(0)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const isStocks = !market || market === 'Stocks'

  const { data: matches = [], isFetching } = useQuery<EgxSymbol[]>({
    queryKey: ['egx-symbols', value, isStocks],
    queryFn: () => api.listEgxSymbols(value, 30),
    enabled: isStocks && open,
    staleTime: 5 * 60_000,
  })

  const safeFocused = Math.min(focusedIndex, Math.max(0, matches.length - 1))

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!isStocks) {
    return (
      <input
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="input"
      />
    )
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => Math.min(i + 1, Math.max(0, matches.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && matches[safeFocused]) {
      e.preventDefault()
      const sel = matches[safeFocused]
      onChange(sel.canonical)
      setOpen(false)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="symbolPicker" ref={wrapperRef}>
      <input
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder || 'Search EGX ticker or name…'}
        disabled={disabled}
        autoFocus={autoFocus}
        className="symbolPickerInput"
      />
      {open ? (
        <div className="symbolPickerDropdown" role="listbox">
          {isFetching ? (
            <div className="symbolPickerEmpty">Searching…</div>
          ) : matches.length === 0 ? (
            <div className="symbolPickerEmpty">No matches. You can type a non-EGX symbol above.</div>
          ) : (
            matches.map((s, idx) => (
              <div
                key={s.id}
                role="option"
                aria-selected={idx === focusedIndex}
                className={`symbolPickerItem ${idx === safeFocused ? 'symbolPickerItemFocused' : ''} ${value === s.canonical ? 'symbolPickerItemSelected' : ''}`}
                onMouseEnter={() => setFocusedIndex(idx)}
                onMouseDown={(e) => { e.preventDefault(); onChange(s.canonical); setOpen(false) }}
              >
                <span className="symbolPickerItemTicker">{s.canonical}</span>
                <span className="symbolPickerItemName">{s.name_en}</span>
                {s.sector ? <span className="symbolPickerItemSector">{s.sector}</span> : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
