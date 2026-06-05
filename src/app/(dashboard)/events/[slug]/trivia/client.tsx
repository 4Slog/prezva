'use client'

import { useState, useTransition } from 'react'
import { seedTriviaQuestions, setTriviaActive } from '@/lib/engagement/sprint10-actions'
import { TRIVIA_QUESTIONS } from '@/lib/templates/trivia'
import { TRIVIA_DIFF_COLORS as DIFF_COLOR } from '@/lib/ui/category-colors'

interface TriviaQuestion { id: string; body?: string; question_text?: string; options?: any[]; correct_index?: number; category?: string; difficulty?: string; points?: number }
interface Props { questions: TriviaQuestion[]; eventId: string; orgId: string; eventSlug?: string; isActive?: boolean }

const inputCls = 'w-full rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface)] px-3 py-2 text-sm text-[var(--pz-text)] placeholder-[var(--pz-muted)] focus:border-[var(--pz-teal)] focus:outline-none'

const getQuestionText = (q: TriviaQuestion) => q.body || q.question_text || ''

export function TriviaAdminClient({ questions: init, eventId, eventSlug, isActive = false }: Props) {
  const [questions, setQuestions] = useState(init)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  // Add custom question state
  const [showAdd, setShowAdd] = useState(false)
  const [published, setPublished] = useState(isActive)

  function handlePrint() {
    const w = window.open('', '_blank')
    if (!w) return
    const html = `<!DOCTYPE html><html><head><title>Trivia Questions</title>
    <style>body{font-family:sans-serif;padding:2rem;color:#111}h1{font-size:1.5rem;margin-bottom:1.5rem}
    .q{margin-bottom:1.5rem;page-break-inside:avoid}.q-text{font-weight:700;margin-bottom:0.5rem;font-size:15px}
    .opt{padding:3px 0;font-size:14px}.correct{color:var(--pz-success);font-weight:600}
    .meta{font-size:11px;color:#888;margin-top:4px}@media print{.no-print{display:none}}</style></head>
    <body><h1>Trivia Questions (${questions.length})</h1>
    ${questions.map((q, i) => `<div class="q">
      <div class="q-text">${i+1}. ${q.body || q.question_text || ''}</div>
      ${(q.options||[]).map((o: string, oi: number) => 
        `<div class="opt ${oi === q.correct_index ? 'correct' : ''}">${oi === q.correct_index ? '✓' : '○'} ${o}</div>`
      ).join('')}
      <div class="meta">${q.category||''} · ${q.difficulty||''}</div>
    </div>`).join('')}
    <script>window.print()</script></body></html>`
    w.document.write(html)
    w.document.close()
  }
  const [newQ, setNewQ] = useState('')
  const [newOpts, setNewOpts] = useState(['', '', '', ''])
  const [newCorrect, setNewCorrect] = useState(0)
  const [newCategory, setNewCategory] = useState('general')
  const [newDifficulty, setNewDifficulty] = useState('medium')

  // Starter pack ships the first 10 — full bank can be added manually
  const STARTER_PACK = TRIVIA_QUESTIONS.slice(0, 10)

  function handleLoadStarter() {
    setShowPreview(false)
    startTransition(async () => {
      const res = await seedTriviaQuestions(eventId, STARTER_PACK)
      if ('error' in res) { setMsg(`Error: ${res.error}`); return }
      setMsg(`Added ${res.count} trivia questions.`)
      const newItems = STARTER_PACK.map((q, i) => ({
        id: `tmp-${i}`, body: q.q, question_text: q.q,
        options: q.options, correct_index: q.correct,
        category: q.category, difficulty: q.difficulty,
      }))
      setQuestions(prev => [...prev, ...newItems])
    })
  }

  function handleAddCustom() {
    if (!newQ.trim() || newOpts.some(o => !o.trim())) return
    startTransition(async () => {
      const res = await seedTriviaQuestions(eventId, [{
        q: newQ.trim(), options: newOpts.map(o => o.trim()),
        correct: newCorrect, category: newCategory, difficulty: newDifficulty,
      }])
      if ('error' in res) { setMsg(`Error: ${res.error}`); return }
      setQuestions(prev => [...prev, {
        id: `tmp-custom-${Date.now()}`, body: newQ.trim(), question_text: newQ.trim(),
        options: newOpts.map(o => o.trim()), correct_index: newCorrect,
        category: newCategory, difficulty: newDifficulty,
      }])
      setNewQ(''); setNewOpts(['', '', '', '']); setNewCorrect(0)
      setShowAdd(false); setMsg('Question added.')
    })
  }

  return (
    <div>
      {msg && <p style={{ color: msg.startsWith('Error') ? 'var(--pz-error)' : 'var(--pz-success)', fontSize: 13, marginBottom: '1rem' }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => setShowPreview(true)} disabled={pending}
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          + Load starter pack (10 questions)
        </button>
        <button onClick={() => setShowAdd(v => !v)} disabled={pending}
          style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.6rem 1.25rem', color: 'var(--pz-text)', fontWeight: 600, cursor: 'pointer' }}>
          + Add custom question
        </button>
        {eventSlug && (
          <a href={`/e/${eventSlug}/trivia?preview=1`} target="_blank" rel="noreferrer"
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
              await setTriviaActive(eventId, next)
              setPublished(next)
              setMsg(next ? 'Published to attendees.' : 'Set to draft.')
            })} disabled={pending}
            style={{ background: published ? 'var(--pz-success-bg)' : 'var(--pz-surface)', border: `1px solid ${published ? 'var(--pz-success)' : 'var(--pz-border)'}`, borderRadius: 8, padding: '0.6rem 1.25rem', color: published ? 'var(--pz-success)' : 'var(--pz-muted)', fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
            {published ? '✓ Published' : 'Publish to attendees'}
          </button>
        </>)}
      </div>

      {/* Custom question form */}
      {showAdd && (
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>New question</p>
          <input className={inputCls} placeholder="Question text" value={newQ} onChange={e => setNewQ(e.target.value)} />
          {newOpts.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" checked={newCorrect === i} onChange={() => setNewCorrect(i)} style={{ accentColor: 'var(--pz-teal)' }} />
              <input className={inputCls} placeholder={`Option ${i + 1}${i === 0 ? ' (mark correct with radio)' : ''}`} value={opt} onChange={e => { const a = [...newOpts]; a[i] = e.target.value; setNewOpts(a) }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <select className={inputCls} value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ flex: 1 }}>
              {['general', 'business', 'technology', 'science', 'history', 'pop_culture'].map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
            <select className={inputCls} value={newDifficulty} onChange={e => setNewDifficulty(e.target.value)} style={{ flex: 1 }}>
              {['easy', 'medium', 'hard'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <button onClick={handleAddCustom} disabled={pending || !newQ.trim() || newOpts.some(o => !o.trim())}
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start', opacity: pending ? 0.6 : 1 }}>
            Save question
          </button>
        </div>
      )}

      {/* Question list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--pz-muted)', fontSize: 14 }}>
            No trivia questions yet. Load the starter pack or add your own above.
          </div>
        )}
        {questions.map((q, i) => (
          <div key={q.id} style={{ border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.875rem 1.25rem', background: 'var(--pz-surface)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--pz-muted)', fontSize: 12, fontWeight: 600, minWidth: 24 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--pz-text)', fontSize: 14, margin: '0 0 6px' }}>{getQuestionText(q)}</p>
                {/* Show answer options if available */}
                {q.options && q.options.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                    {q.options.map((opt, oi) => (
                      <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: oi === q.correct_index ? 'var(--pz-teal-ink)' : 'var(--pz-muted)', minWidth: 14 }}>
                          {oi === q.correct_index ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: 13, color: oi === q.correct_index ? 'var(--pz-text)' : 'var(--pz-muted)' }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  {q.category && (
                    <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', padding: '2px 6px', borderRadius: 4, textTransform: 'capitalize' }}>
                      {q.category.replace('_', ' ')}
                    </span>
                  )}
                  {q.difficulty && (
                    <span style={{ fontSize: 10, fontWeight: 600, background: (DIFF_COLOR[q.difficulty] ?? '#6b7280') + '22', color: DIFF_COLOR[q.difficulty] ?? '#6b7280', padding: '2px 6px', borderRadius: 4 }}>
                      {q.difficulty}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Starter pack preview modal */}
      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--pz-border)' }}>
              <div>
                <h2 style={{ color: 'var(--pz-text)', fontWeight: 700, fontSize: 16, margin: 0 }}>Starter pack — 10 questions</h2>
                <p style={{ color: 'var(--pz-muted)', fontSize: 13, margin: '2px 0 0' }}>Preview before loading</p>
              </div>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', color: 'var(--pz-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {STARTER_PACK.map((q, i) => (
                <div key={q.id} style={{ border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.875rem 1rem', background: 'var(--pz-surface-2)' }}>
                  <p style={{ color: 'var(--pz-text)', fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>{i + 1}. {q.q}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                    {q.options.map((opt, oi) => (
                      <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: oi === q.correct ? 'var(--pz-teal-ink)' : 'var(--pz-muted)', minWidth: 14 }}>
                          {oi === q.correct ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: 12, color: oi === q.correct ? 'var(--pz-text)' : 'var(--pz-muted)' }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', padding: '2px 6px', borderRadius: 4, textTransform: 'capitalize' }}>{q.category.replace('_', ' ')}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, background: (DIFF_COLOR[q.difficulty] ?? '#6b7280') + '22', color: DIFF_COLOR[q.difficulty] ?? '#6b7280', padding: '2px 6px', borderRadius: 4 }}>{q.difficulty}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--pz-border)', display: 'flex', gap: 8 }}>
              <button onClick={handleLoadStarter} disabled={pending}
                style={{ flex: 1, background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, padding: '0.7rem', fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
                {pending ? 'Loading…' : 'Load all 10 questions'}
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
