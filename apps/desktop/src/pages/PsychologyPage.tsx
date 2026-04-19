import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Trade } from '../lib/api'
import type { PsychologyCreate, PsychologyState } from '../lib/api'
import { formatCurrency, formatPct } from '../lib/format'
import { useAccount } from '../components/AccountContext'

const STATES: PsychologyState[] = ['Confident', 'Calm', 'Fear', 'FOMO', 'Overtrading']

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function PsychologyPage() {
  const { currentAccount } = useAccount()
  const qc = useQueryClient()
  const { data: entries, isLoading, error } = useQuery({ 
    queryKey: ['psychology', currentAccount?.id], 
    queryFn: () => api.listPsychology(currentAccount?.id ?? 1) 
  })
  const { data: summary } = useQuery({ 
    queryKey: ['psychologySummary', currentAccount?.id], 
    queryFn: () => api.psychologySummary(currentAccount?.id ?? 1) 
  })

  const { data: trades } = useQuery({ 
    queryKey: ['trades', currentAccount?.id], 
    queryFn: () => api.listTrades(currentAccount?.id ?? 1) 
  })

  const [state, setState] = useState<PsychologyState>('Calm')
  const [intensity, setIntensity] = useState(3)
  const [atLocal, setAtLocal] = useState(() => toDatetimeLocalValue(new Date().toISOString()))
  const [tradeId, setTradeId] = useState<number | ''>('')
  const [notes, setNotes] = useState('')

  const createMutation = useMutation({
    mutationFn: (payload: PsychologyCreate) => api.createPsychology(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['psychology', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['psychologySummary', currentAccount?.id] }),
      ])
      setIntensity(3)
      setTradeId('')
      setNotes('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deletePsychology(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['psychology', currentAccount?.id] }),
        qc.invalidateQueries({ queryKey: ['psychologySummary', currentAccount?.id] }),
      ])
    },
  })

  const tradeOptions = useMemo(() => {
    const rows = (trades as Trade[]) ?? []
    return rows.map((t: Trade) => ({
      id: t.id,
      label: `${t.symbol} #${t.id} • ${new Date(t.exit_date ?? t.entry_date).toISOString().slice(0, 10)} • ${t.pnl == null ? '—' : formatCurrency(t.pnl)}`,
    }))
  }, [trades])

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Trading Psychology</div>
          <div className="pageSubtitle">Track mental state and measure its impact on performance</div>
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load psychology entries. Start the API server.</div> : null}

      <div className="grid panels">
        <div className="card panel">
          <div className="panelTitle">Log a Psychology Entry</div>
          <div className="formGrid">
            <label>
              <div className="label">State</div>
              <select value={state} onChange={(e) => setState(e.target.value as PsychologyState)}>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div className="label">Intensity (1–5)</div>
              <input type="number" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
            </label>
            <label className="span2">
              <div className="label">At</div>
              <input type="datetime-local" value={atLocal} onChange={(e) => setAtLocal(e.target.value)} />
            </label>
            <label className="span2">
              <div className="label">Link to Trade (optional)</div>
              <select value={tradeId} onChange={(e) => setTradeId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">—</option>
                {tradeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="span2">
              <div className="label">Notes</div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </label>
            <button
              className="btn"
              disabled={createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  state,
                  intensity,
                  at: new Date(atLocal).toISOString(),
                  trade_id: tradeId === '' ? null : tradeId,
                  notes: notes.trim() ? notes.trim() : null,
                })
              }
            >
              Save Entry
            </button>
          </div>
          {createMutation.error ? <div className="error">Failed to save entry.</div> : null}
        </div>

        <div className="card panel">
          <div className="panelTitle">Impact Summary (linked trades)</div>
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Count</th>
                  <th>Avg PnL</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {(summary ?? []).map((r) => (
                  <tr key={r.state}>
                    <td>{r.state}</td>
                    <td className="mono">{r.count}</td>
                    <td className={r.avg_pnl != null && r.avg_pnl >= 0 ? 'good' : 'bad'}>
                      {r.avg_pnl == null ? '—' : formatCurrency(r.avg_pnl)}
                    </td>
                    <td>{r.win_rate == null ? '—' : formatPct(r.win_rate)}</td>
                  </tr>
                ))}
                {(summary ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No linked data yet. Link entries to trades to get impact analytics.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Summary only considers entries that have a valid `trade_id` and a closed trade PnL.
          </div>
        </div>

        <div className="card panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panelTitle">Entries</div>
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>At</th>
                  <th>State</th>
                  <th>Intensity</th>
                  <th>Trade</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(entries ?? []).map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.at.slice(0, 16).replace('T', ' ')}</td>
                    <td>{e.state}</td>
                    <td className="mono">{e.intensity}</td>
                    <td className="mono">{e.trade_id ?? '—'}</td>
                    <td>{e.notes ?? '—'}</td>
                    <td>
                      <button className="btn btnGhost" onClick={() => deleteMutation.mutate(e.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {(entries ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No entries yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

