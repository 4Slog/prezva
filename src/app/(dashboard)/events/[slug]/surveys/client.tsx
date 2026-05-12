'use client'
import { useState, useTransition } from 'react'
import { Plus, ChevronDown, ChevronUp, Send, Lock } from 'lucide-react'
import { createSurvey, createSurveyFromTemplate, publishSurvey, closeSurvey } from '@/lib/surveys/actions'
import { TemplatePicker } from '@/components/templates/TemplatePicker'
import type { SurveyTemplate } from '@/lib/templates/types'

interface Survey { id: string; title: string; description: string | null; status: string; created_at: string }

const STATUS_COLOR: Record<string, string> = { draft: '#6b7280', active: '#059669', closed: '#7c3aed' }

export default function SurveysClient({ surveys: init, eventId, orgId, googleFormsConnected }: {
  surveys: Survey[]; eventId: string; slug: string; orgId: string; googleFormsConnected: boolean
}) {
  const [surveys, setSurveys] = useState(init)
  const [showPicker, setShowPicker] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showGFImport, setShowGFImport] = useState(false)
  const [gfFormId, setGfFormId] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [titleDefault, setTitleDefault] = useState('')
  const [descDefault, setDescDefault] = useState('')
  const [templateQuestions, setTemplateQuestions] = useState<SurveyTemplate['questions'] | null>(null)

  function handleTemplatePick(raw: unknown) {
    setShowPicker(false)
    if (raw === null) {
      setTitleDefault('')
      setDescDefault('')
      setTemplateQuestions(null)
    } else {
      const tpl = raw as SurveyTemplate
      setTitleDefault(tpl.name)
      setDescDefault(tpl.description)
      setTemplateQuestions(tpl.questions ?? null)
    }
    setShowCreate(true)
  }

  async function handleGFImport() {
    if (!gfFormId.trim()) return
    setImporting(true)
    try {
      const res = await fetch('/api/integrations/google-forms/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, eventId, formId: gfFormId }),
      })
      const json = await res.json()
      if (json.surveyId) {
        setImportMsg(`Imported ${json.questionCount} questions`)
        const surveyRes = await fetch(`/api/events/${eventId}/surveys`)
        if (surveyRes.ok) { const d = await surveyRes.json(); setSurveys(d) }
      } else {
        setImportMsg('Import failed')
      }
    } finally { setImporting(false); setShowGFImport(false) }
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    const title = fd.get('title') as string
    const desc = (fd.get('description') as string) ?? ''
    startTransition(async () => {
      let res
      if (templateQuestions && templateQuestions.length > 0) {
        res = await createSurveyFromTemplate(eventId, title, desc, templateQuestions)
      } else {
        res = await createSurvey(eventId, fd)
      }
      if (res.error) { setError(res.error); return }
      if (res.data) {
        setSurveys(prev => [res.data as Survey, ...prev])
        setShowCreate(false)
        setTemplateQuestions(null)
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
      {showPicker && (
        <TemplatePicker
          surface="survey"
          orgId={orgId}
          onPick={handleTemplatePick}
          onClose={() => setShowPicker(false)}
        />
      )}
      {importMsg && <p style={{ color: '#059669', fontSize: 14, marginBottom: '1rem' }}>{importMsg}</p>}
      {!showCreate && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
          <button onClick={() => setShowPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={16} /> New Survey
          </button>
          {googleFormsConnected && (
            <button onClick={() => setShowGFImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 500, cursor: 'pointer', fontSize: 14 }}>
              Import from Google Forms
            </button>
          )}
        </div>
      )}
      {showGFImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: '1.5rem', width: '100%', maxWidth: 440 }}>
            <h2 style={{ fontWeight: 700, marginBottom: '1rem' }}>Import from Google Forms</h2>
            <input value={gfFormId} onChange={e => setGfFormId(e.target.value)} placeholder="Google Form ID" style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setShowGFImport(false)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleGFImport} disabled={importing} style={{ padding: '0.5rem 1rem', borderRadius: 8, background: 'var(--color-teal)', color: '#fff', border: 'none', cursor: 'pointer', opacity: importing ? 0.5 : 1 }}>
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCreate && (
        <form onSubmit={handleCreate} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem', background: 'var(--color-surface)' }}>
          <h2 style={{ fontWeight: 700, marginBottom: '1rem' }}>New Survey</h2>
          {templateQuestions && templateQuestions.length > 0 && (
            <p style={{ color: '#059669', fontSize: 13, marginBottom: '0.75rem' }}>
              Template loaded — {templateQuestions.length} question{templateQuestions.length !== 1 ? 's' : ''} will be added automatically.
            </p>
          )}
          {error && <p style={{ color: '#ef4444', marginBottom: '0.75rem', fontSize: 14 }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <input name="title" required defaultValue={titleDefault} placeholder="Survey title..." style={{ padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
            <textarea name="description" rows={2} defaultValue={descDefault} placeholder="Optional description..." style={{ padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={isPending} style={{ background: 'var(--color-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>Create</button>
              <button type="button" onClick={() => { setShowCreate(false); setTemplateQuestions(null) }} style={{ background: 'var(--color-border)', color: 'var(--color-text)', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
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
