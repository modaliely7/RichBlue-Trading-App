import { useState, useRef, useEffect } from 'react'
import { type Strategy } from '../lib/api'

export function StrategySelect({
  selectedIds,
  onChange,
  allStrategies,
  onCreate
}: {
  selectedIds: number[],
  onChange: (ids: number[]) => void,
  allStrategies: Strategy[],
  onCreate: (name: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = query
    ? allStrategies.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : allStrategies

  const selected = allStrategies.filter(s => selectedIds.includes(s.id))

  const uniqueFiltered = Array.from(new Map(filtered.map(s => [s.name.toLowerCase(), s])).values())

  return (
    <div className="strategySelect" ref={containerRef} style={{ position: 'relative' }}>
      <div
        className="tagList"
        onClick={() => setIsOpen(!isOpen)}
        style={{ minHeight: 38, padding: '4px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexWrap: 'wrap', gap: 4, cursor: 'text' }}
      >
        {selected.map(s => (
          <span key={s.id} className="statusPill" style={{ background: s.color || 'var(--accent-dim)', display: 'flex', alignItems: 'center', gap: 6, border: 'none', color: 'var(--text-strong)' }}>
            {s.name}
            <span onClick={(e) => { e.stopPropagation(); onChange(selectedIds.filter(id => id !== s.id)) }} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 14 }}>×</span>
          </span>
        ))}
        <input
          placeholder={selectedIds.length === 0 ? "Select strategies..." : ""}
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true) }}
          onFocus={() => setIsOpen(true)}
          style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, minWidth: 80, color: 'inherit', padding: '4px 0', fontSize: 13 }}
        />
      </div>
      {isOpen && (
        <div className="strategyDropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow)', background: 'var(--panel)' }}>
          {uniqueFiltered.map(s => (
            <div
              key={s.id}
              className="strategyOption"
              onClick={() => {
                if (!selectedIds.includes(s.id)) onChange([...selectedIds, s.id])
                setQuery('')
                setIsOpen(false)
              }}
              style={{ padding: '8px 12px', cursor: 'pointer', background: selectedIds.includes(s.id) ? 'var(--accent-dim)' : 'transparent', fontSize: 13 }}
            >
              {s.name}
            </div>
          ))}
          {query && !allStrategies.some(s => s.name.toLowerCase() === query.toLowerCase()) && (
            <div
              className="strategyOption"
              style={{ padding: '8px 12px', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}
              onClick={async () => {
                await onCreate(query)
                setQuery('')
              }}
            >
              + Add "{query}"
            </div>
          )}
          {filtered.length === 0 && !query && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
              No strategies found. Start typing to add one.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
