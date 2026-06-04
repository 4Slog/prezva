'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createEvent, applyStarterAction } from '@/lib/events/actions'
import { getEventTemplates, createEventFromTemplate } from '@/lib/productivity/sprint11-actions'
import { TemplatePicker } from '@/components/templates/TemplatePicker'
import type { EventTemplate as StarterEventTemplate } from '@/lib/templates/types'

interface Org { id: string; name: string; slug: string }
interface Membership {
  org_id: string
  role: string
  organizations: Org | null
}

interface EventTemplate { id: string; name: string; description: string | null; created_at: string }

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function NewEventPage() {
  const [orgs, setOrgs] = useState<Membership[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [eventType, setEventType] = useState('in_person')
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [useTemplate, setUseTemplate] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [showStarterPicker, setShowStarterPicker] = useState(false)
  const [starterTemplate, setStarterTemplate] = useState<StarterEventTemplate | null>(null)

  useEffect(() => {
    fetch('/api/orgs')
      .then((r) => r.json())
      .then((d) => {
        const filtered = Array.isArray(d) ? d.filter((m: Membership) => ['owner', 'admin'].includes(m.role)) : []
        setOrgs(filtered)
        if (filtered.length === 1) setSelectedOrgId(filtered[0].org_id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedOrgId) return
    getEventTemplates(selectedOrgId).then(setTemplates).catch(() => {})
  }, [selectedOrgId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const fd = new FormData(e.currentTarget)

    if (useTemplate && selectedTemplate) {
      const title = fd.get('title') as string
      const slug = (document.getElementById('slug') as HTMLInputElement)?.value
      const startAt = fd.get('start_at') as string
      const endAt = fd.get('end_at') as string
      if (!title || !slug) { setError('Title and slug are required'); setPending(false); return }
      if (!startAt || !endAt) { setError('Start and end date/time are required'); setPending(false); return }
      const result = await createEventFromTemplate(selectedTemplate, selectedOrgId, title, slug, startAt, endAt)
      setPending(false)
      if (result.error) setError(result.error)
      else window.location.href = `/events/${result.slug}`
      return
    }

    const result = await createEvent(fd)
    if (result?.error) { setError(result.error); setPending(false); return }

    if (starterTemplate && result.id) {
      const startAtStr = fd.get('start_at') as string
      await applyStarterAction(result.id, starterTemplate, startAtStr ?? new Date().toISOString())
    }

    setPending(false)
    window.location.href = `/events/${result.slug}`
  }

  const inputCls = 'w-full rounded-lg border border-[#1E3A5F] bg-[#112240] px-3 py-2 text-sm text-[#F0F4F8] placeholder-[#64748B] focus:border-[#2DD4BF] focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]'
  const labelCls = 'mb-1 block text-sm font-medium text-[#94A3B8]'

  return (
    <div className="mx-auto max-w-2xl">
      {showStarterPicker && (
        <TemplatePicker
          surface="event"
          orgId={selectedOrgId || 'none'}
          onPick={(raw) => { setShowStarterPicker(false); if (raw) setStarterTemplate(raw as StarterEventTemplate) }}
          onClose={() => setShowStarterPicker(false)}
        />
      )}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F4F8]">Create a new event</h1>
          <p className="text-sm text-[#94A3B8] mt-1">Fill in the details to get started.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowStarterPicker(true)}
          className="rounded-lg px-3 py-2 text-sm font-medium border"
          style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-teal)', background: 'none' }}
        >
          Use starter template
        </button>
      </div>
      {starterTemplate && (
        <div className="pz-card p-4 mb-4 flex items-center justify-between" style={{ borderColor: 'var(--pz-teal)', borderWidth: 1 }}>
          <p className="text-sm" style={{ color: 'var(--pz-text)' }}>
            Template: <strong>{starterTemplate.name}</strong> — {starterTemplate.description}
          </p>
          <button type="button" onClick={() => setStarterTemplate(null)} style={{ background: 'none', border: 'none', color: 'var(--pz-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
      )}

      {orgs.length === 0 && (
        <div className="pz-card p-6 mb-6 text-center">
          <p className="text-sm text-[#94A3B8]">
            You need an organization to create events.{' '}
            <Link href="/orgs/new" className="text-[#2DD4BF] hover:underline">Create one</Link>
          </p>
        </div>
      )}

      {templates.length > 0 && (
        <div
          style={{ border: '1px solid var(--pz-teal)', borderRadius: 8, padding: 16, marginBottom: 24 }}
          className="flex items-center justify-between gap-4"
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: '#F0F4F8' }}>
              You have {templates.length} saved template{templates.length !== 1 ? 's' : ''}. Skip the setup?
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
              Start from a template — never configure from scratch again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setUseTemplate(true)
              document.getElementById('template-section')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="flex-shrink-0 rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Browse templates
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* Organization */}
        <div className="pz-card p-5">
          <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Organization</h2>
          <div>
            <label className={labelCls}>Organization *</label>
            <select
              name="org_id"
              required
              className={inputCls}
              value={selectedOrgId}
              onChange={e => { setSelectedOrgId(e.target.value); setSelectedTemplate(''); setUseTemplate(false) }}
            >
              <option value="">Select an organization</option>
              {orgs.map((m) => m.organizations && (
                <option key={m.org_id} value={m.org_id}>{m.organizations.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* T-120: Create from template */}
        {templates.length > 0 && (
          <div id="template-section" className="pz-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useTemplate} onChange={e => setUseTemplate(e.target.checked)} className="rounded" />
                <span className="text-sm font-semibold text-[#F0F4F8]">Start from a template</span>
              </label>
            </div>
            {useTemplate && (
              <div>
                <label className={labelCls}>Template</label>
                <select className={inputCls} value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} required={useTemplate}>
                  <option value="">Select a template</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}{t.description ? ` — ${t.description}` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Basic info */}
        <div className="pz-card p-5">
          <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Event details</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelCls}>Event name *</label>
              <input
                name="title"
                required
                minLength={2}
                maxLength={120}
                placeholder="2026 Annual Leadership Summit"
                onChange={(e) => {
                  const s = document.getElementById('slug') as HTMLInputElement
                  if (s && !s.dataset.touched) s.value = toSlug(e.target.value)
                }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>URL slug *</label>
              <div className="flex rounded-lg overflow-hidden border border-[#1E3A5F] focus-within:border-[#2DD4BF] focus-within:ring-1 focus-within:ring-[#2DD4BF]">
                <span className="bg-[#0D1B2A] border-r border-[#1E3A5F] px-3 py-2 text-sm text-[#64748B] select-none">
                  prezva.app/e/
                </span>
                <input
                  id="slug"
                  name="slug"
                  required
                  pattern="[a-z0-9-]+"
                  placeholder="annual-leadership-summit"
                  onInput={(e) => { (e.target as HTMLInputElement).dataset.touched = 'true' }}
                  className="flex-1 bg-[#112240] px-3 py-2 text-sm text-[#F0F4F8] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                name="description"
                rows={3}
                maxLength={5000}
                defaultValue={starterTemplate?.description ?? ''}
                placeholder="What is this event about?"
                className={`${inputCls} resize-none`}
              />
            </div>
            <div>
              <label className={labelCls}>Event type *</label>
              <select
                name="event_type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className={inputCls}
              >
                <option value="in_person">In Person</option>
                <option value="virtual">Virtual</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Timezone *</label>
              <select name="timezone" defaultValue="America/Chicago" className={inputCls}>
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>

        {/* Date & time */}
        <div className="pz-card p-5">
          <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Date & time</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start *</label>
              <input type="datetime-local" name="start_at" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End *</label>
              <input type="datetime-local" name="end_at" required className={inputCls} />
            </div>
          </div>
        </div>

        {/* Venue */}
        {(eventType === 'in_person' || eventType === 'hybrid') && (
          <div className="pz-card p-5">
            <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Venue</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>Venue name</label>
                <input name="venue_name" placeholder="Convention Center" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input name="venue_address" placeholder="123 Main St" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>City</label>
                  <input name="venue_city" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input name="venue_state" className={inputCls} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Virtual */}
        {(eventType === 'virtual' || eventType === 'hybrid') && (
          <div className="pz-card p-5">
            <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Virtual</h2>
            <div>
              <label className={labelCls}>Stream / meeting URL</label>
              <input name="virtual_url" type="url" placeholder="https://zoom.us/j/…" className={inputCls} />
            </div>
          </div>
        )}

        {/* Capacity */}
        <div className="pz-card p-5">
          <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Capacity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Max attendees</label>
              <input name="capacity" type="number" min="1" placeholder="Unlimited" className={inputCls} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input name="waitlist_enabled" type="checkbox" value="true" className="rounded" />
                <span className="text-sm text-[#94A3B8]">Enable waitlist</span>
              </label>
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-[var(--pz-error)]/10 px-4 py-3 text-sm text-[var(--pz-error)]">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending || orgs.length === 0}
          className="rounded-lg py-3 text-sm font-semibold disabled:opacity-50 transition-opacity"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {pending ? 'Creating event…' : 'Create event'}
        </button>
      </form>
    </div>
  )
}
