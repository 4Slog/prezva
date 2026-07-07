'use client'

import { useState, useTransition } from 'react'
import { seedIcebreakerPrompts, setIcebreakersActive } from '@/lib/engagement/sprint10-actions'
import { ICEBREAKER_PROMPTS } from '@/lib/templates/icebreakers'

interface IcebreakerQuestion {
  id: string;
  question?: string;
  question_text?: string;
  prompt?: string;
  category?: string
}
interface Props {
  questions: IcebreakerQuestion[]
  eventId: string
  orgId: string
  eventSlug: string
  isActive?: boolean
  seedAction?: typeof seedIcebreakerPrompts
  setActiveAction?: typeof setIcebreakersActive
}

const inputCls = 'w-full rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface)] px-3 py-2 text-sm text-[var(--pz-text)] placeholder-[var(--pz-muted)] focus:border-[var(--pz-teal)] focus:outline-none'

const getPromptText = (q: IcebreakerQuestion) => q.question || q.question_text || q.prompt || ''

export function IcebreakersAdminClient({
  questions: init,
  eventId,
  eventSlug,
  isActive = false,
  seedAction = seedIcebreakerPrompts,
  setActiveAction = setIcebreakersActive,
}: Props) {
  const [questions, setQuestions] = useState(init)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState('')
  const [customText, setCustomText] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [starterOffset, setStarterOffset] = useState(0)
  const [published, setPublished] = useState(isActive)

  function handlePrint() {
    const w = window.open('', '_blank')
    if (!w) return
    const html = `<!DOCTYPE html><html><head><title>Icebreaker Prompts</title>
    <style>body{font-family:sans-serif;padding:2rem;color:#111}h1{font-size:1.5rem;margin-bottom:1.5rem}
    .q{margin-bottom:1rem;padding:0.75rem;border:1px solid #eee;border-radius:6px;page-break-inside:avoid}
    .q-text{font-size:15px}@media print{.no-print{display:none}}</style></head>
    <body><h1>Icebreaker Prompts (${questions.length})</h1>
    ${questions.map((q, i) => 
      `<div class="q"><span style="color:#888;margin-right:8px">${i+1}.</span><span class="q-text">${getPromptText(q)}</span></div>`
    ).join('')}
    <script>window.print()</script></body></html>`
    w.document.write(html)
    w.document.close()
  }

  function handleLoadStarter() {
    setShowPreview(false)
    startTransition(async () => {
      const res = await seedAction(eventId, ICEBREAKER_PROMPTS.slice(starterOffset, starterOffset + 10))
      setStarterOffset(prev => Math.min(prev + 10, 50))
      if ('error' in res) { setMsg(`Error: ${res.error}`); return }
      setMsg(`Added ${res.count} starter prompts.`)
      const newItems = ICEBREAKER_PROMPTS.slice(starterOffset, starterOffset + 10).map((p, i) => ({ id: `tmp-${starterOffset + i}`, question_text: p.text }))
      setQuestions(prev => [...prev, ...newItems])
    })
  }

  function handleAddCustom() {
    if (!customText.trim()) return
    startTransition(async () => {
      const res = await seedAction(eventId, [{ text: customText.trim(), tags: [] }])
      if ('error' in res) { setMsg(`Error: ${res.error}`); return }
      setQuestions(prev => [...prev, { id: `tmp-custom-${Date.now()}`, question_text: customText.trim() }])
      setCustomText('')
      setMsg('Prompt added. Click "Publish to attendees" to make it visible.')
    })
  }

  return (
    <div>
      {msg && <p style={{ color: msg.startsWith('Error') ? 'var(--pz-error)' : 'var(--pz-success)', fontSize: 13, marginBottom: '1rem' }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => setShowPreview(true)} disabled={pending}
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          + Use starter pack (10 prompts)
        </button>
        {eventSlug && (
          <a href={`/e/${eventSlug}/icebreakers?preview=1`} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--pz-surface)', border: '1px solid var(--pz-teal)', borderRadius: 8, padding: '0.6rem 1.25rem', color: 'var(--pz-teal)', fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>
            Preview as attendee ↗
          </a>
        )}
        {questions.length > 0 && (<>
          <button onClick={handlePrint}
            style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.6rem 1.25rem', color: 'var(--pz-muted)', cursor: 'pointer' }}>
            🖨 Print
          </button>
          <button onClick={() => startTransition(async () => {
              const next = !published
              const res = await setActiveAction(eventSlug, next)
              if (res && 'error' in res) { setMsg(`Error: ${res.error}`); return }
              setPublished(next)
              setMsg(next ? 'Published to attendees.' : 'Set to draft.')
            })} disabled={pending}
            style={{ background: published ? 'var(--pz-success-bg)' : 'var(--pz-surface)', border: `1px solid ${published ? 'var(--pz-success)' : 'var(--pz-border)'}`, borderRadius: 8, padding: '0.6rem 1.25rem', color: published ? 'var(--pz-success)' : 'var(--pz-muted)', fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
            {published ? '✓ Published' : 'Publish to attendees'}
          </button>
        </>)}
      </div>

      {/* Custom prompt input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        <input value={customText} onChange={e => setCustomText(e.target.value)}
          placeholder="Add a custom icebreaker prompt…" className={inputCls}
          onKeyDown={e => e.key === 'Enter' && handleAddCustom()} />
        <button onClick={handleAddCustom} disabled={pending || !customText.trim()}
          style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.6rem 1rem', color: 'var(--pz-text)', cursor: 'pointer', opacity: pending ? 0.6 : 1, whiteSpace: 'nowrap' }}>
          Add
        </button>
      </div>

      {/* Prompt list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--pz-muted)', fontSize: 14 }}>
            No icebreaker prompts yet. Load the starter pack or add your own above.
          </div>
        )}
        {questions.map((q, i) => (
          <div key={q.id} style={{ border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.875rem 1.25rem', background: 'var(--pz-surface)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--pz-muted)', fontSize: 12, fontWeight: 600, minWidth: 24 }}>{i + 1}</span>
            <p style={{ color: 'var(--pz-text)', fontSize: 14, flex: 1, margin: 0 }}>{getPromptText(q)}</p>
          </div>
        ))}
      </div>

      {/* Starter pack preview modal */}
      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--pz-border)' }}>
              <div>
                <h2 style={{ color: 'var(--pz-text)', fontWeight: 700, fontSize: 16, margin: 0 }}>Starter pack — prompts {starterOffset + 1}–{Math.min(starterOffset + 10, 50)} of 50</h2>
                <p style={{ color: 'var(--pz-muted)', fontSize: 13, margin: '2px 0 0' }}>Preview before loading</p>
              </div>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', color: 'var(--pz-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ICEBREAKER_PROMPTS.slice(starterOffset, starterOffset + 10).map((p, i) => (
                <div key={p.id} style={{ border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.75rem 1rem', background: 'var(--pz-surface-2)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--pz-muted)', fontSize: 12, fontWeight: 600, minWidth: 20 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: 'var(--pz-text)', fontSize: 13, margin: '0 0 4px' }}>{p.text.replace('{event_title}', 'your event')}</p>
                    {p.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {p.tags.map(tag => (
                          <span key={tag} style={{ fontSize: 10, fontWeight: 600, background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', padding: '1px 5px', borderRadius: 4 }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--pz-border)', display: 'flex', gap: 8 }}>
              <button onClick={handleLoadStarter} disabled={pending}
                style={{ flex: 1, background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, padding: '0.7rem', fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
                {pending ? 'Loading…' : `Load prompts ${starterOffset + 1}–${Math.min(starterOffset + 10, 50)}`}
              </button>
              <button onClick={() => setShowPreview(false)}
                style={{ background: 'transparent', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.7rem 1.25rem', color: 'var(--pz-muted)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
