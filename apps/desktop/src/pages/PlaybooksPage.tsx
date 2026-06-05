import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api, type Playbook, type PlaybookCreate, type PlaybookSetup, type PlaybookSetupCreate, type PlaybookUpdate } from '../lib/api'
import { useAccount } from '../components/AccountContext'

const SETUP_SOFT_MIN = 3
const SETUP_HARD_MAX = 5

const COLOR_SWATCHES = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#0ea5e9', '#a855f7', '#ec4899', '#14b8a6']

function PlaybookForm({ initial, onSubmit, onCancel, submitLabel }: { initial?: Playbook; onSubmit: (p: PlaybookCreate) => void; onCancel: () => void; submitLabel: string }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState<string | null>(initial?.color ?? COLOR_SWATCHES[0])
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)

  return (
    <div className="formGrid">
      <label className="span2">
        <div className="label">Name</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Momentum Breakout" />
      </label>
      <label>
        <div className="label">Color</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 36 }}>
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{
                width: 22, height: 22, borderRadius: 11, border: '2px solid',
                borderColor: color === c ? 'var(--text)' : 'var(--border)',
                background: c, cursor: 'pointer', padding: 0,
              }}
              aria-label={`Pick color ${c}`}
            />
          ))}
        </div>
      </label>
      <label>
        <div className="label">Status</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36 }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span style={{ color: 'var(--text)' }}>Active</span>
        </label>
      </label>
      <label className="span4">
        <div className="label">Description</div>
        <textarea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>
      <div className="span4 detailsActions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btnGhost" onClick={onCancel}>Cancel</button>
        <button
          className="btn btnPrimary"
          disabled={!name.trim()}
          onClick={() => onSubmit({ name: name.trim(), description: description?.trim() || null, color, is_active: isActive })}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

function SetupForm({ initial, onSubmit, onCancel, submitLabel }: { initial?: PlaybookSetup; onSubmit: (p: PlaybookSetupCreate) => void; onCancel: () => void; submitLabel: string }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [entryRules, setEntryRules] = useState(initial?.entry_rules ?? '')
  const [exitRules, setExitRules] = useState(initial?.exit_rules ?? '')

  return (
    <div className="formGrid">
      <label className="span4">
        <div className="label">Setup name</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 20-EMA pullback" />
      </label>
      <label className="span4">
        <div className="label">Description (optional)</div>
        <textarea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>
      <label className="span2">
        <div className="label">Entry rules</div>
        <textarea value={entryRules ?? ''} onChange={(e) => setEntryRules(e.target.value)} rows={3} placeholder="e.g. Pullback to 20-EMA in uptrend, RSI > 40" />
      </label>
      <label className="span2">
        <div className="label">Exit rules</div>
        <textarea value={exitRules ?? ''} onChange={(e) => setExitRules(e.target.value)} rows={3} placeholder="e.g. Stop below swing low; target 2R" />
      </label>
      <div className="span4 detailsActions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btnGhost" onClick={onCancel}>Cancel</button>
        <button
          className="btn btnPrimary"
          disabled={!name.trim()}
          onClick={() => onSubmit({
            name: name.trim(),
            description: description?.trim() || null,
            entry_rules: entryRules?.trim() || null,
            exit_rules: exitRules?.trim() || null,
            image_path: null,
            order_index: initial?.order_index ?? 0,
          })}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

export function PlaybooksPage() {
  const { currentAccount } = useAccount()
  const qc = useQueryClient()
  const accountId = currentAccount?.id ?? 1

  const { data: playbooks, isLoading, error } = useQuery({
    queryKey: ['playbooks', accountId],
    queryFn: () => api.listPlaybooks(accountId),
  })

  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [setupEditing, setSetupEditing] = useState<{ playbookId: number; setupId: number | null } | null>(null)

  const createMutation = useMutation({
    mutationFn: (payload: PlaybookCreate) => api.createPlaybook(payload, accountId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['playbooks', accountId] })
      setCreating(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PlaybookUpdate }) => api.updatePlaybook(id, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['playbooks', accountId] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deletePlaybook(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['playbooks', accountId] })
    },
  })

  const createSetupMutation = useMutation({
    mutationFn: ({ playbookId, payload }: { playbookId: number; payload: PlaybookSetupCreate }) =>
      api.createPlaybookSetup(playbookId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['playbooks', accountId] })
      setSetupEditing(null)
    },
  })

  const updateSetupMutation = useMutation({
    mutationFn: ({ playbookId, setupId, payload }: { playbookId: number; setupId: number; payload: Partial<PlaybookSetupCreate> }) =>
      api.updatePlaybookSetup(playbookId, setupId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['playbooks', accountId] })
      setSetupEditing(null)
    },
  })

  const deleteSetupMutation = useMutation({
    mutationFn: ({ playbookId, setupId }: { playbookId: number; setupId: number }) =>
      api.deletePlaybookSetup(playbookId, setupId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['playbooks', accountId] })
    },
  })

  const sorted = useMemo(() => (playbooks ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [playbooks])
  const firstId = sorted[0]?.id
  const isExpanded = (id: number) => expanded[id] ?? (id === firstId && Object.keys(expanded).length === 0)

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Playbooks</div>
          <div className="pageSubtitle">Define your setups — each playbook contains 3-5 named setups with entry/exit rules</div>
        </div>
        <div className="detailsActions">
          <button className="btn btnPrimary" onClick={() => setCreating((c) => !c)}>
            <Plus size={14} /> {creating ? 'Cancel' : 'New Playbook'}
          </button>
        </div>
      </div>

      {creating && (
        <div className="card panel" style={{ marginBottom: 12 }}>
          <div className="panelTitle">New Playbook</div>
          <PlaybookForm
            onSubmit={(p) => createMutation.mutate(p)}
            onCancel={() => setCreating(false)}
            submitLabel={createMutation.isPending ? 'Creating…' : 'Create'}
          />
          {createMutation.isError && (
            <div className="error" style={{ marginTop: 8 }}>
              {String((createMutation.error as Error).message || 'Failed to create playbook')}
            </div>
          )}
        </div>
      )}

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load playbooks. Start the API server.</div> : null}

      {sorted.length === 0 && !isLoading && !creating ? (
        <div className="emptyState">
          <div className="title">No playbooks yet</div>
          <div className="subtitle">Create your first playbook to start tagging trades with your setups.</div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sorted.map((pb) => {
          const isOpen = isExpanded(pb.id)
          const isEditing = editingId === pb.id
          const belowMin = pb.setup_count < SETUP_SOFT_MIN
          const atMax = pb.setup_count >= SETUP_HARD_MAX
          return (
            <div key={pb.id} className="card panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className="btn btnGhost"
                  onClick={() => setExpanded((e) => ({ ...e, [pb.id]: !isOpen }))}
                  style={{ padding: 4 }}
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {pb.color && <span style={{ width: 14, height: 14, borderRadius: 7, background: pb.color, display: 'inline-block' }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{pb.name}</span>
                    {!pb.is_active && <span className="statusPill" style={{ opacity: 0.6 }}>Inactive</span>}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {pb.setup_count} setup{pb.setup_count === 1 ? '' : 's'}
                    </span>
                  </div>
                  {pb.description && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{pb.description}</div>}
                </div>
                {isOpen && !isEditing && (
                  <div className="detailsActions">
                    <button className="btn btnGhost" onClick={() => setEditingId(pb.id)}>Edit</button>
                    <button
                      className="btn btnGhost"
                      onClick={() => {
                        if (confirm(`Delete playbook "${pb.name}"? This will remove all its setups.`)) {
                          deleteMutation.mutate(pb.id)
                        }
                      }}
                      style={{ color: 'var(--bad)' }}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>

              {isOpen && belowMin && !isEditing && (
                <div className="warning" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> Below recommended minimum of {SETUP_SOFT_MIN} setups.
                </div>
              )}

              {isOpen && isEditing && (
                <div style={{ marginTop: 12 }}>
                  <PlaybookForm
                    initial={pb}
                    onSubmit={(p) => updateMutation.mutate({ id: pb.id, payload: p })}
                    onCancel={() => setEditingId(null)}
                    submitLabel={updateMutation.isPending ? 'Saving…' : 'Save'}
                  />
                  {updateMutation.isError && (
                    <div className="error" style={{ marginTop: 8 }}>
                      {String((updateMutation.error as Error).message || 'Failed to update')}
                    </div>
                  )}
                </div>
              )}

              {isOpen && !isEditing && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pb.setups.length === 0 ? (
                    <div className="muted" style={{ fontSize: 13 }}>No setups defined yet.</div>
                  ) : (
                    pb.setups.map((s) => {
                      const isSetupEditing = setupEditing?.playbookId === pb.id && setupEditing?.setupId === s.id
                      if (isSetupEditing) {
                        return (
                          <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
                            <SetupForm
                              initial={s}
                              onSubmit={(p) => updateSetupMutation.mutate({ playbookId: pb.id, setupId: s.id, payload: p })}
                              onCancel={() => setSetupEditing(null)}
                              submitLabel={updateSetupMutation.isPending ? 'Saving…' : 'Save'}
                            />
                          </div>
                        )
                      }
                      return (
                        <div
                          key={s.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 12,
                            padding: 10,
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            background: 'var(--panel2)',
                          }}
                        >
                          <CheckCircle2 size={16} style={{ color: 'var(--good)', marginTop: 2 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ color: 'var(--text)', fontWeight: 600 }}>{s.name}</div>
                            {s.description && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{s.description}</div>}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                              {s.entry_rules && (
                                <div>
                                  <div className="label" style={{ fontSize: 11 }}>Entry</div>
                                  <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{s.entry_rules}</div>
                                </div>
                              )}
                              {s.exit_rules && (
                                <div>
                                  <div className="label" style={{ fontSize: 11 }}>Exit</div>
                                  <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{s.exit_rules}</div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="detailsActions">
                            <button className="btn btnGhost" onClick={() => setSetupEditing({ playbookId: pb.id, setupId: s.id })}>Edit</button>
                            <button
                              className="btn btnGhost"
                              onClick={() => {
                                if (confirm(`Delete setup "${s.name}"?`)) {
                                  deleteSetupMutation.mutate({ playbookId: pb.id, setupId: s.id })
                                }
                              }}
                              style={{ color: 'var(--bad)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}

                  {setupEditing?.playbookId === pb.id && setupEditing.setupId === null && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
                      <SetupForm
                        onSubmit={(p) => createSetupMutation.mutate({ playbookId: pb.id, payload: p })}
                        onCancel={() => setSetupEditing(null)}
                        submitLabel={createSetupMutation.isPending ? 'Adding…' : 'Add Setup'}
                      />
                      {createSetupMutation.isError && (
                        <div className="error" style={{ marginTop: 8 }}>
                          {String((createSetupMutation.error as Error).message || 'Failed to create setup')}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="detailsActions" style={{ marginTop: 4 }}>
                    <button
                      className="btn btnGhost"
                      onClick={() => setSetupEditing({ playbookId: pb.id, setupId: null })}
                      disabled={atMax}
                      title={atMax ? `Maximum ${SETUP_HARD_MAX} setups` : 'Add a setup'}
                    >
                      <Plus size={14} /> Add Setup {atMax ? `(max ${SETUP_HARD_MAX})` : ''}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
