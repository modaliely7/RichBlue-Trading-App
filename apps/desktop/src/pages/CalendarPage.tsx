import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Trade, type OverviewResponse } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useAccount } from '../components/AccountContext'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1)
}

function getTradeDayKey(t: Trade) {
  const iso = t.exit_date ?? t.entry_date
  const d = new Date(iso)
  return dayKeyLocal(d)
}

export function CalendarPage() {
  const { currentAccount } = useAccount()
  const { data: ov, isLoading, error } = useQuery<OverviewResponse>({ 
    queryKey: ['overview', currentAccount?.id], 
    queryFn: () => api.overview(currentAccount?.id ?? 1) 
  })
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [jumpDate, setJumpDate] = useState(() => dayKeyLocal(new Date()))

  const days = useMemo(() => {
    const start = startOfMonth(month)
    const firstDow = start.getDay() // 0..6 (Sun..Sat)
    const gridStart = new Date(start)
    gridStart.setDate(start.getDate() - firstDow)

    const arr: Array<{ date: Date; key: string; inMonth: boolean }> = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      arr.push({
        date: d,
        key: dayKeyLocal(d),
        inMonth: d.getMonth() === month.getMonth(),
      })
    }
    return arr
  }, [month])

  const daily = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: Trade[] }>()
    for (const t of ov?.trades ?? []) {
      const key = getTradeDayKey(t)
      const cur = map.get(key) ?? { pnl: 0, trades: [] }
      cur.trades.push(t)
      cur.pnl += t.pnl ?? 0
      map.set(key, cur)
    }
    return map
  }, [ov])

  const selected = useMemo(() => {
    if (!selectedDay) return null
    return daily.get(selectedDay) ?? { pnl: 0, trades: [] }
  }, [daily, selectedDay])

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Calendar</div>
          <div className="pageSubtitle">Daily PnL heatmap and drill-down by day</div>
        </div>
        <div className="detailsActions">
          <label className="muted">
            <span style={{ marginRight: 8 }}>Go to</span>
            <input
              type="date"
              value={jumpDate}
              onChange={(e) => {
                const v = e.target.value
                setJumpDate(v)
                const d = new Date(`${v}T00:00:00`)
                if (Number.isFinite(d.getTime())) {
                  setMonth(startOfMonth(d))
                  setSelectedDay(v)
                }
              }}
            />
          </label>
          <button className="btn btnGhost" onClick={() => setMonth((m) => addMonths(m, -1))}>
            Prev
          </button>
          <div className="statusPill mono">
            {month.getFullYear()}-{pad2(month.getMonth() + 1)}
          </div>
          <button className="btn btnGhost" onClick={() => setMonth((m) => addMonths(m, 1))}>
            Next
          </button>
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load trades. Start the API server.</div> : null}

      <div className="calendarLayout">
        <div className="card panel">
          <div className="calendarGrid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="calendarDow">
                {d}
              </div>
            ))}
            {days.map((d) => {
              const info = daily.get(d.key)
              const pnl = info?.pnl ?? 0
              const hasTrades = (info?.trades.length ?? 0) > 0
              const tone = !hasTrades ? 'none' : pnl >= 0 ? 'pos' : 'neg'
              const isSelected = selectedDay === d.key
              return (
                <button
                  key={d.key}
                  className={`calendarCell ${d.inMonth ? '' : 'out'} tone-${tone} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedDay(d.key)}
                  title={hasTrades ? `${d.key} • ${formatCurrency(pnl)} • ${info!.trades.length} trades` : d.key}
                >
                  <div className="calendarDay">{d.date.getDate()}</div>
                  {hasTrades ? (
                    <div className={`calendarPnl ${pnl >= 0 ? 'good' : 'bad'}`}>
                      {pnl === 0 ? '—' : (pnl > 0 ? '+' : '') + formatCurrency(pnl).replace('$', '')}
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="card panel">
          <div className="panelTitle">Day Details</div>
          {selectedDay ? (
            <>
              <div className="detailsLine">
                <span className="muted">Selected Day</span>
                <span className="mono" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>{selectedDay}</span>
              </div>
              <div className="detailsLine">
                <span className="muted">Daily PnL</span>
                <span className={`mono ${selected && selected.pnl >= 0 ? 'good' : 'bad'}`} style={{ fontWeight: 800 }}>
                  {formatCurrency(selected?.pnl ?? 0)}
                </span>
              </div>
              <div className="detailsLine">
                <span className="muted">Total Trades</span>
                <span className="mono" style={{ color: 'var(--accent)' }}>{selected?.trades.length ?? 0}</span>
              </div>

              {selected?.trades.length ? (
                <div className="tableWrap" style={{ marginTop: 20 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.trades.map((t) => (
                        <tr key={t.id}>
                          <td className="mono" style={{ color: 'var(--accent)' }}>{t.symbol}</td>
                          <td className={t.pnl != null && t.pnl >= 0 ? 'good' : 'bad'} style={{ fontWeight: 700 }}>
                            {t.pnl == null ? '—' : formatCurrency(t.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 20, textAlign: 'center' }}>No trades recorded for this day.</div>
              )}
            </>
          ) : (
            <div className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>Click a day in the calendar to see details.</div>
          )}
        </div>
      </div>
    </div>
  )
}


