import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { OverviewSyncBar } from '../components/OverviewSyncBar'
import { formatCurrency } from '../lib/format'

export function CashPage() {
  const qc = useQueryClient()
  const { data: balanceRes, isLoading: balanceLoading } = useQuery({ 
    queryKey: ['cashBalance'], 
    queryFn: () => api.cashBalance() 
  })
  
  const { data: txs, isLoading: txsLoading } = useQuery({ 
    queryKey: ['cashTransactions'], 
    queryFn: () => api.cashTransactions() 
  })

  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [adjustAmount, setAdjustAmount] = useState('')

  const [editingTxId, setEditingTxId] = useState<number | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNote, setEditNote] = useState('')

  const depositMutation = useMutation({
    mutationFn: (payload: { amount: number; at?: string; note?: string }) => api.cashDeposit(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['cashBalance'] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions'] }),
        qc.invalidateQueries({ queryKey: ['overview'] })
      ])
      setDepositAmount('')
    }
  })

  const withdrawMutation = useMutation({
    mutationFn: (payload: { amount: number; at?: string; note?: string }) => api.cashWithdraw(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['cashBalance'] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions'] }),
        qc.invalidateQueries({ queryKey: ['overview'] })
      ])
      setWithdrawAmount('')
    }
  })

  const adjustMutation = useMutation({
    mutationFn: (payload: { amount: number; at?: string; note?: string }) => api.cashAdjust(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['cashBalance'] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions'] }),
        qc.invalidateQueries({ queryKey: ['overview'] })
      ])
      setAdjustAmount('')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteCashTransaction,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['cashBalance'] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions'] }),
        qc.invalidateQueries({ queryKey: ['overview'] })
      ])
    },
    onError: (e) => {
      alert(String(e))
    }
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; amount: number; at?: string; note?: string }) => 
      api.updateCashTransaction(payload.id, { amount: payload.amount, at: payload.at, note: payload.note }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['cashBalance'] }),
        qc.invalidateQueries({ queryKey: ['cashTransactions'] }),
        qc.invalidateQueries({ queryKey: ['overview'] })
      ])
      setEditingTxId(null)
    },
    onError: (e) => {
      alert(String(e))
    }
  })

  const isLoading = balanceLoading || txsLoading

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Cash Management</div>
          <div className="pageSubtitle">Deposit, withdraw, adjust and view all cash transactions.</div>
        </div>
        <div className="detailsActions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <OverviewSyncBar />
        </div>
      </div>

      <div className="grid panels">
        <div className="card panel">
          <div className="panelTitle">Available Cash</div>
          <div style={{ fontSize: 36, fontWeight: 'bold', margin: '10px 0', color: '#f8fafc' }}>
            {balanceRes ? formatCurrency(balanceRes.balance) : '—'}
          </div>
          <div className="muted">
            This is the cash available for trading. It is automatically updated when trades are opened or closed.
          </div>
        </div>

        <div className="card panel">
          <div className="panelTitle">Cash Actions</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                type="number" 
                placeholder="Deposit amount" 
                value={depositAmount} 
                onChange={e => setDepositAmount(e.target.value)} 
              />
              <button 
                className="btn" 
                disabled={!depositAmount || depositMutation.isPending}
                onClick={() => depositMutation.mutate({ amount: parseFloat(depositAmount) })}
              >
                Deposit
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                type="number" 
                placeholder="Withdraw amount" 
                value={withdrawAmount} 
                onChange={e => setWithdrawAmount(e.target.value)} 
              />
              <button 
                className="btn btnGhost" 
                style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}
                disabled={!withdrawAmount || withdrawMutation.isPending}
                onClick={() => withdrawMutation.mutate({ amount: parseFloat(withdrawAmount) })}
              >
                Withdraw
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                type="number" 
                placeholder="Adjust (can be +/-)" 
                value={adjustAmount} 
                onChange={e => setAdjustAmount(e.target.value)} 
              />
              <button 
                className="btn btnGhost" 
                disabled={!adjustAmount || adjustMutation.isPending}
                onClick={() => adjustMutation.mutate({ amount: parseFloat(adjustAmount) })}
              >
                Adjust
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card panel" style={{ marginTop: 20 }}>
        <div className="panelTitle">Transaction History</div>
        {isLoading ? (
          <div className="muted">Loading...</div>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Trade ID</th>
                  <th>Symbol</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {txs && txs.length > 0 ? txs.map(tx => {
                  const isEditing = editingTxId === tx.id
                  return (
                  <tr key={tx.id}>
                    <td>
                      {isEditing ? (
                        <input 
                          type="datetime-local" 
                          value={editDate} 
                          onChange={e => setEditDate(e.target.value)} 
                          style={{ padding: 4, width: '100%' }}
                        />
                      ) : (
                        new Date(tx.at).toLocaleString()
                      )}
                    </td>
                    <td>
                      <span className={`statusPill ${tx.amount > 0 ? 'status-ok' : tx.amount < 0 ? 'status-breached' : ''}`}>
                        {tx.tx_type}
                      </span>
                    </td>
                    <td className={tx.amount > 0 ? 'good' : tx.amount < 0 ? 'bad' : ''} style={{ fontWeight: 'bold' }}>
                      {isEditing ? (
                        <input 
                          type="number" 
                          value={editAmount} 
                          onChange={e => setEditAmount(e.target.value)} 
                          style={{ padding: 4, width: '100px' }}
                        />
                      ) : (
                        (tx.amount > 0 ? '+' : '') + formatCurrency(tx.amount)
                      )}
                    </td>
                    <td>{tx.trade_id ? `#${tx.trade_id}` : '—'}</td>
                    <td>{tx.symbol || '—'}</td>
                    <td>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editNote} 
                          onChange={e => setEditNote(e.target.value)} 
                          style={{ padding: 4, width: '100%' }}
                        />
                      ) : (
                        tx.note || '—'
                      )}
                    </td>
                    <td>
                      {['Deposit', 'Withdraw', 'Adjustment'].includes(tx.tx_type) ? (
                        isEditing ? (
                          <>
                            <button 
                              className="btn btnGhost" 
                              style={{ padding: '4px 8px', fontSize: 12, marginRight: 4 }}
                              disabled={updateMutation.isPending}
                              onClick={() => {
                                const parsedDate = editDate ? new Date(editDate).toISOString() : undefined
                                updateMutation.mutate({ 
                                  id: tx.id, 
                                  amount: parseFloat(editAmount), 
                                  at: parsedDate, 
                                  note: editNote 
                                })
                              }}
                            >
                              Save
                            </button>
                            <button 
                              className="btn btnGhost" 
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              onClick={() => setEditingTxId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              className="btn btnGhost" 
                              style={{ padding: '4px 8px', fontSize: 12, marginRight: 4 }}
                              onClick={() => {
                                setEditingTxId(tx.id)
                                setEditAmount(String(tx.amount))
                                // Convert to local datetime string for input type="datetime-local"
                                const dt = new Date(tx.at)
                                setEditDate(new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16))
                                setEditNote(tx.note || '')
                              }}
                            >
                              Edit
                            </button>
                            <button 
                              className="btn btnGhost" 
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if(window.confirm('Delete this cash transaction? This will impact your balance and historical portfolio values.')) {
                                  deleteMutation.mutate(tx.id)
                                }
                              }}
                            >
                              Delete
                            </button>
                          </>
                        )
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>Auto (Linked)</span>
                      )}
                    </td>
                  </tr>
                )}) : (
                  <tr>
                    <td colSpan={7} className="muted text-center">No cash transactions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
