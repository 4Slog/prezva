'use client'
import { useState, useTransition } from 'react'
import { Plus, ChevronDown, ChevronUp, BarChart2, Send, Lock } from 'lucide-react'
import { createSurvey, addQuestion, publishSurvey, closeSurvey } from '@/lib/surveys/actions'

interface Survey { id: string; title: string; description: string | null; status: string; created_at: string }

const STATUS_COLOR: Record<string, string> = { draft: '#6b7280', active: '#059669', closed: '#7c3aed' }

export default function SurveysClient({ surveys: init, eventId, slug }: {
  surveys: Survey[]; eventId: string; slug: string
}) {
  const [surveys, setSurveys] = useState(init)
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createSurvey(eventId, fd)
      if ('error' in res && res.error) { setError(res.error); return }
      if ('data' in res && res.data) {
        setSurveys(prev => [res.data as Survey, ...prev])
        setShowCreate(false)
      }
    })
  }

  function handlePublish(id: string) {
    startTransition(async () => {
      await publishSurvey(id)
      setSurveys(prev => prev.map(s => s.id === id ? { ...s, status: 'active' } : s))
    })
  }

  function handleClose(id: string) {
    startTransition(async () => {
      await closeSurvey(id)
      setSurveys(prev => prev.map(s => s.id === id ? { ...s, status: 'closed' } : s))
    })
  }

  return (
    <div>
      {!showCreate && (
        <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer', marginBottom: '1.5rem' }}>
          <Plus size={16} /> New Survey
        </button>
      )}
      {showCreate && (
        <form onSubmit={handleCreate} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem', background: 'var(--color-surface)' }}>
          <h2 style={{ fontWeight: 700, marginBottom: '1rem' }}>New Survey</h2>
          {error && <p style={{ color: '#ef4444', marginBottom: '0.75rem', fontSize: 14 }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <input name="title" required placeholder="Survey title..." style={{ padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
            <textarea name="description" rows={2} placeholder="Optional description..." style={{ padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={isPending} style={{ background: 'var(--color-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>Create</button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ background: 'var(--color-border)', color: 'var(--color-text)', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </form>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {surveys.length === 0 && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem 0' }}>No surveys created yet.</p>}
        {surveys.map(s => {
          const color = STATUS_COLOR[s.status] ?? '#6b7280'
          const isOpen = expanded === s.id
          return (
            <div key={s.id} style={{ border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)' }}>
              <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontWeight: 600 }}>{s.title}</p>
                    <span style={{ fontSize: 11, fontWeight: 600, background: color + '22', color, padding: '2px 8px', borderRadius: 20, textTransform: 'capitalize' }}>{s.status}</span>
                  </div>
                  {s.description && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>{s.description}</p>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {s.status === 'draft' && <button onClick={() => handlePublish(s.id)} disabled={isPending} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Send size={12} /> Publish</button>}
                  {s.status === 'active' && <button onClick={() => handleClose(s.id)} disabled={isPending} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Lock size={12} /> Close</button>}
                  <button onClick={() => setExpanded(isOpen ? null : s.id)} style={{ background: 'var(--color-border)', color: 'var(--color-text)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
