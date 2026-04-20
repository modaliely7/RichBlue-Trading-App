import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { LessonCategory, LessonCreate } from '../lib/api'
import { useAccount } from '../components/AccountContext'

const CATEGORIES: LessonCategory[] = ['Lesson', 'Mistake', 'Psychological note', 'Strategy insight']

function nowIso() {
  return new Date().toISOString()
}

export function LessonsPage() {
  const { currentAccount } = useAccount()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<LessonCategory | ''>('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['lessons', currentAccount?.id, q, category],
    queryFn: () => api.listLessons({ q: q.trim() || undefined, category: category || undefined, account_id: currentAccount?.id ?? 1 }),
  })

  const [title, setTitle] = useState('Post-trade review')
  const [cat, setCat] = useState<LessonCategory>('Lesson')
  const [tags, setTags] = useState('breakout, risk')
  const [content, setContent] = useState('')

  const createMutation = useMutation({
    mutationFn: (payload: LessonCreate) => api.createLesson(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['lessons'] })
      setTitle('Post-trade review')
      setCat('Lesson')
      setTags('')
      setContent('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteLesson(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['lessons'] })
    },
  })

  const rows = useMemo(() => data ?? [], [data])

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Lessons Learned</div>
          <div className="pageSubtitle">Capture mistakes, insights, and psychological notes — searchable later</div>
        </div>
      </div>

      <div className="card panel">
        <div className="panelTitle">Add Lesson</div>
        <div className="formGrid">
          <label className="span2">
            <div className="label">Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            <div className="label">Category</div>
            <select value={cat} onChange={(e) => setCat(e.target.value as LessonCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="span2">
            <div className="label">Tags (comma separated)</div>
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <label className="span2">
            <div className="label">Content</div>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
          </label>
          <button
            className="btn"
            disabled={createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                title: title.trim(),
                category: cat,
                tags: tags.trim() ? tags.trim() : null,
                trade_id: null,
                content: content.trim() || '—',
                created_at: nowIso(),
                updated_at: nowIso(),
              })
            }
          >
            Save
          </button>
        </div>
        {createMutation.error ? <div className="error">Failed to create lesson.</div> : null}
      </div>

      <div className="card panel" style={{ marginTop: 12 }}>
        <div className="panelTitle">Search</div>
        <div className="formGrid">
          <label className="span2">
            <div className="label">Query</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, content, tags…" />
          </label>
          <label>
            <div className="label">Category</div>
            <select value={category} onChange={(e) => setCategory((e.target.value as any) || '')}>
              <option value="">All</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {error ? <div className="error">Failed to load lessons. Start the API server.</div> : null}

      <div className="card panel" style={{ marginTop: 12 }}>
        <div className="panelTitle">Lessons</div>
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Updated</th>
                <th>Category</th>
                <th>Title</th>
                <th>Tags</th>
                <th>Content</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td className="mono">{x.updated_at.slice(0, 16).replace('T', ' ')}</td>
                  <td>{x.category}</td>
                  <td>{x.title}</td>
                  <td className="mono">{x.tags ?? '—'}</td>
                  <td>{x.content}</td>
                  <td>
                    <button className="btn btnGhost" onClick={() => deleteMutation.mutate(x.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No lessons yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

