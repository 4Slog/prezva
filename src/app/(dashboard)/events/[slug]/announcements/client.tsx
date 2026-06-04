'use client'
import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Field } from '@/components/ui/Field'
import { Send, Trash2, Mail, Bell, BellRing, Sparkles } from 'lucide-react'
import { createAnnouncement, deleteAnnouncement } from '@/lib/announcements/actions'
import { draftAnnouncement } from '@/lib/announcements/ai-draft-actions'
import { sendSMSAnnouncement, getSMSEligibleCount } from '@/lib/announcements/sms-actions'
import { TemplatePicker } from '@/components/templates/TemplatePicker'
import type { AnnouncementTemplate } from '@/lib/templates/types'

interface Announcement {
  id: string; title: string; body: string; channel: string
  sent_at: string | null; recipient_count: number; segment: string | null
}
const CHANNEL_ICON = { email: Mail, push: Bell, both: BellRing }
const CHANNEL_COLOR: Record<string, string> = { email: '#0891b2', push: '#7c3aed', both: 'var(--pz-success)' }

export default function AnnouncementsClient({ announcements: init, eventId, slug, orgId }: {
  announcements: Announcement[]; eventId: string; slug: string; orgId: string
}) {
  const [announcements, setAnnouncements] = useState(init)
  const [showPicker, setShowPicker] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [titleDefault, setTitleDefault] = useState('')
  const [bodyDefault, setBodyDefault] = useState('')
  const [channelDefault, setChannelDefault] = useState('email')
  const [subjectOptions, setSubjectOptions] = useState<string[]>([])
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiContext, setAiContext] = useState('')
  const [aiDrafting, setAiDrafting] = useState(false)
  const [aiError, setAiError] = useState('')
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [smsMessage, setSmsMessage] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsResult, setSmsResult] = useState<string | null>(null)
  const [smsEligible, setSmsEligible] = useState<number>(0)

  useEffect(() => {
    getSMSEligibleCount(eventId).then(setSmsEligible).catch(() => {})
  }, [eventId])

  function handleTemplatePick(raw: unknown) {
    setShowPicker(false)
    if (raw !== null) {
      const tpl = raw as AnnouncementTemplate
      setTitleDefault(tpl.subject ?? '')
      setBodyDefault(tpl.body ?? '')
      setSubjectOptions(tpl.subjects ?? [])
      const ch = tpl.channels?.length === 2 ? 'both' : (tpl.channels?.[0] ?? 'email')
      setChannelDefault(ch)
    } else {
      setTitleDefault('')
      setBodyDefault('')
      setSubjectOptions([])
      setChannelDefault('email')
    }
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createAnnouncement(eventId, fd)
      if ('error' in res && res.error) { setError(res.error); return }
      if ('data' in res && res.data) {
        setAnnouncements(prev => [res.data as Announcement, ...prev])
        setShowForm(false)
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return
    startTransition(async () => {
      await deleteAnnouncement(id, eventId)
      setAnnouncements(prev => prev.filter(a => a.id !== id))
    })
  }

  async function handleSendSMS() {
    if (!smsMessage.trim()) return
    setSmsSending(true)
    const result = await sendSMSAnnouncement(eventId, smsMessage)
    setSmsSending(false)
    if ('error' in result && result.error) {
      setSmsResult('Error: ' + result.error)
    } else if ('sent' in result) {
      const failed = result.failed ?? 0
      setSmsResult(`✓ Sent to ${result.sent} of ${result.total} attendees${failed > 0 ? ` (${failed} failed)` : ''}`)
      setSmsMessage('')
    }
  }

  async function handleAiDraft(type: string) {
    if (!aiContext.trim()) return
    setAiDrafting(true)
    setAiError('')
    const res = await draftAnnouncement(eventId, type, aiContext)
    setAiDrafting(false)
    if (res.error) { setAiError(res.error); return }
    if (res.draft && bodyRef.current) {
      bodyRef.current.value = res.draft
      setBodyDefault(res.draft)
    }
    setShowAiPanel(false)
    setAiContext('')
  }

  return (
    <div>
      {showPicker && (
        <TemplatePicker
          surface="announcement"
          orgId={orgId}
          onPick={handleTemplatePick}
          onClose={() => setShowPicker(false)}
        />
      )}
      {!showForm && (
        <button onClick={() => setShowPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer', marginBottom: '1.5rem' }}>
          <Send size={16} /> New Announcement
        </button>
      )}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem', background: 'var(--color-surface)' }}>
          <h2 style={{ fontWeight: 700, marginBottom: '1rem' }}>New Announcement</h2>
          {error && <p style={{ color: 'var(--pz-error)', marginBottom: '0.75rem', fontSize: 14 }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Field label="Subject" htmlFor="ann-title">
              <input id="ann-title" name="title" required maxLength={200} defaultValue={titleDefault} placeholder="Announcement subject..." style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)', fontSize: 14, boxSizing: 'border-box' }} />
              {subjectOptions.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--pz-muted)', alignSelf: 'center', marginRight: 2 }}>Subject options:</span>
                  {subjectOptions.map((s, i) => (
                    <button key={i} type="button"
                      onClick={e => { const inp = (e.currentTarget.closest('div')?.previousElementSibling as HTMLInputElement); if (inp) inp.value = s; setTitleDefault(s) }}
                      style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1px solid var(--color-teal)', color: 'var(--color-teal)', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {s.length > 40 ? s.slice(0, 40) + '…' : s}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Message" htmlFor="ann-message">
              {process.env.NEXT_PUBLIC_AI_DRAFTING_ENABLED !== 'false' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => setShowAiPanel(p => !p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--color-teal)', color: 'var(--color-teal)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    <Sparkles size={11} /> Draft with AI
                  </button>
                </div>
              )}
              {showAiPanel && (
                <div style={{ marginBottom: 8, padding: '0.75rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 6 }}>What&apos;s this announcement about?</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={aiContext}
                      onChange={e => setAiContext(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAiDraft(titleDefault || 'general')}
                      placeholder="e.g. keynote speaker added, parking info, schedule change…"
                      style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)', fontSize: 13 }}
                    />
                    <button
                      type="button"
                      disabled={aiDrafting || !aiContext.trim()}
                      onClick={() => handleAiDraft(titleDefault || 'general')}
                      style={{ background: 'var(--color-teal)', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: aiDrafting || !aiContext.trim() ? 0.6 : 1 }}
                    >
                      {aiDrafting ? 'Generating…' : 'Generate'}
                    </button>
                  </div>
                  {aiError && <p style={{ fontSize: 12, color: 'var(--pz-error)', marginTop: 4 }}>{aiError}</p>}
                </div>
              )}
              <textarea id="ann-message" ref={bodyRef} name="body" required maxLength={2000} rows={4} defaultValue={bodyDefault} placeholder="Write your message..." style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
            </Field>
            <Field label="Channel" htmlFor="ann-channel">
              <select id="ann-channel" name="channel" defaultValue={channelDefault} style={{ padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)', fontSize: 14 }}>
                <option value="email">Email only</option>
                <option value="push">Push only</option>
                <option value="both">Email + Push</option>
              </select>
            </Field>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" disabled={isPending} style={{ background: 'var(--color-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}>
                {isPending ? 'Sending...' : 'Send Now'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: 'var(--color-border)', color: 'var(--pz-text)', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </form>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {announcements.length === 0 && (
          <p style={{ color: 'var(--pz-muted)', textAlign: 'center', padding: '3rem 0' }}>No announcements sent yet.</p>
        )}
        {announcements.map(a => {
          const Icon = CHANNEL_ICON[a.channel as keyof typeof CHANNEL_ICON] ?? Mail
          const color = CHANNEL_COLOR[a.channel] ?? '#0891b2'
          return (
            <div key={a.id} style={{ border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <Link href={`/events/${slug}/announcements/${a.id}`} style={{ display: 'flex', gap: 12, flex: 1, padding: '1rem 1.25rem', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
                  <Icon size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{a.title}</p>
                  <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: 6, lineHeight: 1.5 }}>{a.body}</p>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--pz-muted)' }}>
                    <span>{a.recipient_count} recipients</span>
                    <span>{a.sent_at ? new Date(a.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Draft'}</span>
                    <span style={{ background: color + '22', color, padding: '1px 8px', borderRadius: 20, textTransform: 'capitalize' }}>{a.channel}</span>
                  </div>
                </div>
              </Link>
              <button onClick={() => handleDelete(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pz-muted)', padding: '1rem', flexShrink: 0 }}>
                <Trash2 size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* SMS Announcements */}
      <div style={{ marginTop: '2rem', padding: '1.25rem', background: 'var(--color-surface)',
                    borderRadius: 12, border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>
            📱 SMS Announcement
          </h2>
          <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
            {smsEligible} attendee{smsEligible !== 1 ? 's' : ''} with phone numbers
          </span>
        </div>
        {smsEligible === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>
            No attendees have provided phone numbers yet.
          </p>
        ) : (
          <>
            <textarea
              value={smsMessage}
              onChange={e => setSmsMessage(e.target.value.slice(0, 160))}
              placeholder="Type your SMS message (160 characters max)..."
              rows={3}
              style={{ width: '100%', padding: '0.625rem', borderRadius: 8, fontSize: 14,
                       border: '1px solid var(--color-border)', background: 'var(--pz-bg)',
                       color: 'var(--pz-text)', resize: 'none', marginBottom: 8,
                       boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: smsMessage.length > 140 ? 'var(--pz-warning-fill)' : 'var(--pz-muted)' }}>
                {smsMessage.length}/160 characters
              </span>
              <button
                onClick={handleSendSMS}
                disabled={smsSending || !smsMessage.trim()}
                style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none',
                         background: 'var(--color-teal)', color: '#fff',
                         fontWeight: 700, fontSize: 13, cursor: 'pointer',
                         opacity: smsSending || !smsMessage.trim() ? 0.5 : 1 }}>
                {smsSending ? 'Sending…' : `Send SMS to ${smsEligible} attendees`}
              </button>
            </div>
            {smsResult && (
              <p style={{ fontSize: 12, marginTop: 8,
                          color: smsResult.startsWith('Error') ? 'var(--pz-error)' : 'var(--pz-success-fill)' }}>
                {smsResult}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
