'use client'
import { useState, useTransition } from 'react'
import { Plus, ChevronDown, ChevronUp, Send, Lock, Link, Mail, Pencil } from 'lucide-react'
import NextLink from 'next/link'
import { createSurvey, createSurveyFromTemplate, publishSurvey, closeSurvey, sendSurveyToAllAttendees } from '@/lib/surveys/actions'
import { TemplatePicker } from '@/components/templates/TemplatePicker'
import type { SurveyTemplate } from '@/lib/templates/types'
import { SURVEY_STATUS_COLORS as STATUS_COLOR } from '@/lib/ui/category-colors'
import { Gated } from '@/components/auth/Gated'

interface Survey { id: string; title: string; description: string | null; status: string; created_at: string }

function extractGFormId(input: string): string {
  const match = input.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input.trim()
}

export default function SurveysClient({ surveys: init, eventId, slug, orgId, googleFormsConnected, permissions }: {
  surveys: Survey[]; eventId: string; slug: string; orgId: string; googleFormsConnected: boolean; permissions: string[]
}) {
  const [surveys, setSurveys] = useState(init)
  const [showPicker, setShowPicker] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showGFImport, setShowGFImport] = useState(false)
  const [gfFormInput, setGfFormInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [titleDefault, setTitleDefault] = useState('')
  const [descDefault, setDescDefault] = useState('')
  const [templateQuestions, setTemplateQuestions] = useState<SurveyTemplate['questions'] | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendMsg, setSendMsg] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://prezva.app'

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
    if (!gfFormInput.trim()) return
    const formId = extractGFormId(gfFormInput)
    setImporting(true)
    try {
      const res = await fetch('/api/integrations/google-forms/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, eventId, formId }),
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

  function handleCopyLink(surveyId: string) {
    const url = `${appUrl}/survey/${surveyId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(surveyId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  function handleSendToAll(surveyId: string) {
    setSendingId(surveyId)
    startTransition(async () => {
      const result = await sendSurveyToAllAttendees(surveyId, eventId)
      if ('error' in result) {
        setSendMsg(prev => ({ ...prev, [surveyId]: result.error }))
      } else {
        setSendMsg(prev => ({ ...prev, [surveyId]: `Sent to ${result.sent}/${result.total} attendees` }))
      }
      setSendingId(null)
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
      {importMsg && <p style={{ color: 'var(--pz-success)', fontSize: 14, marginBottom: '1rem' }}>{importMsg}</p>}
      {!showCreate && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
          <Gated permission="surveys.manage" perms={permissions} mode="disable">
            <button onClick={() => setShowPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-teal)', color: 'var(--pz-surface)', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={16} /> New Survey
            </button>
          </Gated>
          {googleFormsConnected && (
            <Gated permission="surveys.manage" perms={permissions} mode="disable">
              <button onClick={() => setShowGFImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 500, cursor: 'pointer', fontSize: 14 }}>
                Import from Google Forms
              </button>
            </Gated>
          )}
        </div>
      )}
      {showGFImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: '1.5rem', width: '100%', maxWidth: 440 }}>
            <h2 style={{ fontWeight: 700, marginBottom: '1rem' }}>Import from Google Forms</h2>
            <input
              value={gfFormInput}
              onChange={e => setGfFormInput(e.target.value)}
              placeholder="Paste Google Form URL or ID"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }}
            />
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>Accepts full URL or bare Form ID</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setShowGFImport(false)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleGFImport} disabled={importing} style={{ padding: '0.5rem 1rem', borderRadius: 8, background: 'var(--color-teal)', color: 'var(--pz-surface)', border: 'none', cursor: 'pointer', opacity: importing ? 0.5 : 1 }}>
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
            <p style={{ color: 'var(--pz-success)', fontSize: 13, marginBottom: '0.75rem' }}>
              Template loaded — {templateQuestions.length} question{templateQuestions.length !== 1 ? 's' : ''} will be added automatically.
            </p>
          )}
          {error && <p style={{ color: 'var(--pz-error)', marginBottom: '0.75rem', fontSize: 14 }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <input name="title" required defaultValue={titleDefault} placeholder="Survey title..." style={{ padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
            <textarea name="description" rows={2} defaultValue={descDefault} placeholder="Optional description..." style={{ padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={isPending} style={{ background: 'var(--color-teal)', color: 'var(--pz-surface)', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>Create</button>
              <button type="button" onClick={() => { setShowCreate(false); setTemplateQuestions(null) }} style={{ background: 'var(--color-border)', color: 'var(--color-text)', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </form>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {surveys.length === 0 && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem 0' }}>No surveys created yet.</p>}
        {surveys.map(s => {
          const color = STATUS_COLOR[s.status] ?? 'var(--pz-muted)'
          const isOpen = expanded === s.id
          const isPublished = s.status === 'active'
          return (
            <div key={s.id} style={{ border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)' }}>
              <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontWeight: 600 }}>{s.title}</p>
                    <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--pz-surface-2)', color, padding: '2px 8px', borderRadius: 20, textTransform: 'capitalize' }}>{s.status}</span>
                  </div>
                  {s.description && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>{s.description}</p>}
                  {sendMsg[s.id] && <p style={{ fontSize: 12, color: 'var(--pz-success)', marginTop: 4 }}>{sendMsg[s.id]}</p>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <NextLink
                    href={`/events/${slug}/surveys/${s.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
                  >
                    <Pencil size={12} /> Edit Questions
                  </NextLink>
                  {s.status === 'draft' && <Gated permission="surveys.manage" perms={permissions} mode="disable"><button onClick={() => handlePublish(s.id)} disabled={isPending} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--pz-success)', color: 'var(--pz-surface)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Send size={12} /> Publish</button></Gated>}
                  {s.status === 'active' && <Gated permission="surveys.manage" perms={permissions} mode="disable"><button onClick={() => handleClose(s.id)} disabled={isPending} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Lock size={12} /> Close</button></Gated>}
                  {isPublished && (
                    <button
                      onClick={() => handleCopyLink(s.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
                    >
                      <Link size={12} /> {copiedId === s.id ? 'Copied!' : 'Copy Link'}
                    </button>
                  )}
                  <a
                    href={`${appUrl}/survey/${s.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-surface)', color: 'var(--color-teal)', border: '1px solid var(--color-teal)', borderRadius: 6, padding: '4px 10px', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}
                  >
                    Preview ↗
                  </a>
                  {isPublished && (
                    <Gated permission="surveys.manage" perms={permissions} mode="disable">
                      <button
                        onClick={() => handleSendToAll(s.id)}
                        disabled={sendingId === s.id || isPending}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-teal)', color: 'var(--pz-surface)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: sendingId === s.id ? 0.6 : 1 }}
                      >
                        <Mail size={12} /> {sendingId === s.id ? 'Sending…' : 'Send to Attendees'}
                      </button>
                    </Gated>
                  )}
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
