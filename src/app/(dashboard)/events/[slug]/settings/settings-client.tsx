'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  cloneEvent,
  saveEventAsTemplate,
  getEventTemplates,
  setEventRecurrence,
  createNextOccurrence,
} from '@/lib/productivity/sprint11-actions'

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

interface Props {
  eventId: string
  eventSlug: string
  orgId: string
  currentRecurrence: string | null
  outlookConnected?: boolean
  driveConnected?: boolean
  sharepointConnected?: boolean
}

export function EventSettingsClient({ eventId, eventSlug, orgId, currentRecurrence, outlookConnected, driveConnected, sharepointConnected }: Props) {
  const router = useRouter()

  // Clone
  const [cloneTitle, setCloneTitle] = useState('')
  const [cloneSlug, setCloneSlug] = useState('')
  const [cloneLoading, setCloneLoading] = useState(false)
  const [cloneError, setCloneError] = useState('')

  // Template save
  const [tplName, setTplName] = useState('')
  const [tplDesc, setTplDesc] = useState('')
  const [tplLoading, setTplLoading] = useState(false)
  const [tplSaved, setTplSaved] = useState(false)
  const [tplError, setTplError] = useState('')

  // Recurrence
  const [recurrence, setRecurrence] = useState<string>(currentRecurrence ?? '')
  const [recurLoading, setRecurLoading] = useState(false)
  const [recurSaved, setRecurSaved] = useState(false)
  const [recurError, setRecurError] = useState('')

  // Create next occurrence
  const [nextLoading, setNextLoading] = useState(false)
  const [nextError, setNextError] = useState('')

  // Outlook
  const [outlookLoading, setOutlookLoading] = useState(false)
  const [outlookDone, setOutlookDone] = useState(false)

  // Drive / SharePoint file picker
  const [driveFiles, setDriveFiles] = useState<{ id: string; name: string; mimeType: string; webViewLink: string }[]>([])
  const [showDrive, setShowDrive] = useState(false)
  const [driveLoading, setDriveLoading] = useState(false)
  const [spFiles, setSpFiles] = useState<{ id: string; name: string; downloadUrl: string }[]>([])
  const [showSP, setShowSP] = useState(false)
  const [spLoading, setSpLoading] = useState(false)

  async function handleOutlookAdd() {
    setOutlookLoading(true)
    await fetch('/api/integrations/outlook/create-calendar-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, eventId }),
    })
    setOutlookLoading(false)
    setOutlookDone(true)
    setTimeout(() => setOutlookDone(false), 3000)
  }

  async function openDrive() {
    setDriveLoading(true)
    const res = await fetch(`/api/integrations/google-drive/list-files?orgId=${orgId}`)
    const json = await res.json()
    setDriveFiles(json.files ?? [])
    setShowDrive(true)
    setDriveLoading(false)
  }

  async function openSharePoint() {
    setSpLoading(true)
    const res = await fetch(`/api/integrations/sharepoint/list-files?orgId=${orgId}`)
    const json = await res.json()
    setSpFiles(json.files ?? [])
    setShowSP(true)
    setSpLoading(false)
  }

  const inputCls = 'w-full rounded-lg border border-[#1E3A5F] bg-[#112240] px-3 py-2 text-sm text-[#F0F4F8] placeholder-[#64748B] focus:border-[#00BFA6] focus:outline-none focus:ring-1 focus:ring-[#00BFA6]'
  const labelCls = 'mb-1 block text-sm font-medium text-[#94A3B8]'
  const btnCls = 'rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50'

  async function handleClone(e: React.FormEvent) {
    e.preventDefault()
    if (!cloneTitle || !cloneSlug) return
    setCloneLoading(true)
    setCloneError('')
    const result = await cloneEvent(eventId, cloneTitle, cloneSlug) as { error?: string; id?: string; slug?: string }
    setCloneLoading(false)
    if (result.error) { setCloneError(result.error); return }
    router.push(`/events/${result.slug!}`)
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!tplName) return
    setTplLoading(true)
    setTplError('')
    const result = await saveEventAsTemplate(eventId, tplName, tplDesc)
    setTplLoading(false)
    if (result.error) { setTplError(result.error); return }
    setTplSaved(true)
    setTplName('')
    setTplDesc('')
  }

  async function handleSaveRecurrence(e: React.FormEvent) {
    e.preventDefault()
    setRecurLoading(true)
    setRecurError('')
    const val = recurrence || null
    const result = await setEventRecurrence(eventId, val as 'annual' | 'quarterly' | 'monthly' | null)
    setRecurLoading(false)
    if (result.error) { setRecurError(result.error); return }
    setRecurSaved(true)
    setTimeout(() => setRecurSaved(false), 2000)
  }

  async function handleCreateNext() {
    if (!confirm('Create the next occurrence of this event now?')) return
    setNextLoading(true)
    setNextError('')
    const result = await createNextOccurrence(eventId) as { error?: string; id?: string; slug?: string }
    setNextLoading(false)
    if (result.error) { setNextError(result.error); return }
    router.push(`/events/${result.slug!}`)
  }

  return (
    <>
      {/* T-119: Clone event */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#F0F4F8] mb-1">Clone event</h2>
        <p className="text-xs text-[#64748B] mb-4">Creates a copy with the same sessions, tickets, and speakers (no registrations).</p>
        <form onSubmit={handleClone} className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>New event name</label>
            <input
              className={inputCls}
              placeholder="2027 Annual Summit"
              value={cloneTitle}
              onChange={e => {
                setCloneTitle(e.target.value)
                setCloneSlug(toSlug(e.target.value))
              }}
              required
            />
          </div>
          <div>
            <label className={labelCls}>URL slug</label>
            <input
              className={inputCls}
              placeholder="2027-annual-summit"
              value={cloneSlug}
              onChange={e => setCloneSlug(toSlug(e.target.value))}
              required
            />
          </div>
          {cloneError && <p className="text-sm text-[#EF4444]">{cloneError}</p>}
          <button type="submit" disabled={cloneLoading} className={btnCls} style={{ background: 'var(--pz-teal)', color: '#0D1B2A', alignSelf: 'flex-start' }}>
            {cloneLoading ? 'Cloning…' : 'Clone event'}
          </button>
        </form>
      </section>

      {/* T-120: Save as template */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#F0F4F8] mb-1">Save as org template</h2>
        <p className="text-xs text-[#64748B] mb-4">Save this event structure as a reusable template for your organization.</p>
        {tplSaved ? (
          <p className="text-sm text-[#00BFA6]">Template saved successfully.</p>
        ) : (
          <form onSubmit={handleSaveTemplate} className="flex flex-col gap-3">
            <div>
              <label className={labelCls}>Template name</label>
              <input className={inputCls} placeholder="Annual Conference Template" value={tplName} onChange={e => setTplName(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input className={inputCls} placeholder="Optional description" value={tplDesc} onChange={e => setTplDesc(e.target.value)} />
            </div>
            {tplError && <p className="text-sm text-[#EF4444]">{tplError}</p>}
            <button type="submit" disabled={tplLoading} className={btnCls} style={{ background: 'var(--pz-teal)', color: '#0D1B2A', alignSelf: 'flex-start' }}>
              {tplLoading ? 'Saving…' : 'Save as template'}
            </button>
          </form>
        )}
      </section>

      {/* T-121: Recurring event */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#F0F4F8] mb-1">Recurrence</h2>
        <p className="text-xs text-[#64748B] mb-4">Set a recurrence schedule to automatically generate the next occurrence.</p>
        <form onSubmit={handleSaveRecurrence} className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Recurrence</label>
            <select className={inputCls} value={recurrence} onChange={e => setRecurrence(e.target.value)}>
              <option value="">None</option>
              <option value="annual">Annual (next occurrence 90 days before end)</option>
              <option value="quarterly">Quarterly (next occurrence 30 days before end)</option>
              <option value="monthly">Monthly (next occurrence 7 days before end)</option>
            </select>
          </div>
          {recurError && <p className="text-sm text-[#EF4444]">{recurError}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={recurLoading} className={btnCls} style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}>
              {recurLoading ? 'Saving…' : recurSaved ? 'Saved!' : 'Save recurrence'}
            </button>
            {currentRecurrence && (
              <button
                type="button"
                onClick={handleCreateNext}
                disabled={nextLoading}
                className={`${btnCls} border border-[#1E3A5F] text-[#94A3B8] hover:text-[#F0F4F8]`}
              >
                {nextLoading ? 'Creating…' : 'Create next occurrence now'}
              </button>
            )}
          </div>
          {nextError && <p className="text-sm text-[#EF4444]">{nextError}</p>}
        </form>
      </section>

      {/* Integrations */}
      {(outlookConnected || driveConnected || sharepointConnected) && (
        <section className="pz-card p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Integrations</h2>
          <div className="flex flex-wrap gap-3">
            {outlookConnected && (
              <button
                onClick={handleOutlookAdd}
                disabled={outlookLoading || outlookDone}
                className={`${btnCls} border border-[#1E3A5F] text-[#94A3B8] hover:text-[#F0F4F8] disabled:opacity-50`}
              >
                {outlookDone ? 'Added to Outlook ✓' : outlookLoading ? 'Adding…' : 'Add to Outlook Calendar'}
              </button>
            )}
            {driveConnected && (
              <button
                onClick={openDrive}
                disabled={driveLoading}
                className={`${btnCls} border border-[#1E3A5F] text-[#94A3B8] hover:text-[#F0F4F8] disabled:opacity-50`}
              >
                {driveLoading ? 'Loading…' : 'Attach from Drive'}
              </button>
            )}
            {sharepointConnected && (
              <button
                onClick={openSharePoint}
                disabled={spLoading}
                className={`${btnCls} border border-[#1E3A5F] text-[#94A3B8] hover:text-[#F0F4F8] disabled:opacity-50`}
              >
                {spLoading ? 'Loading…' : 'Attach from SharePoint'}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Google Drive file picker modal */}
      {showDrive && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#112240] rounded-xl p-6 w-full max-w-md space-y-4 border border-[#1E3A5F] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[#F0F4F8]">Google Drive files</h2>
              <button onClick={() => setShowDrive(false)} className="text-[#64748B] hover:text-[#94A3B8] text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1">
              {driveFiles.length === 0 ? (
                <p className="text-sm text-[#64748B]">No files found.</p>
              ) : driveFiles.map(f => (
                <a
                  key={f.id}
                  href={f.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#1E3A5F] text-sm text-[#94A3B8] hover:text-[#F0F4F8] transition-colors"
                >
                  <span className="text-xs opacity-60 shrink-0 w-16 truncate">{f.mimeType.split('.').pop()}</span>
                  <span className="flex-1 truncate">{f.name}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SharePoint file picker modal */}
      {showSP && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#112240] rounded-xl p-6 w-full max-w-md space-y-4 border border-[#1E3A5F] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[#F0F4F8]">SharePoint files</h2>
              <button onClick={() => setShowSP(false)} className="text-[#64748B] hover:text-[#94A3B8] text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1">
              {spFiles.length === 0 ? (
                <p className="text-sm text-[#64748B]">No files found.</p>
              ) : spFiles.map(f => (
                <a
                  key={f.id}
                  href={f.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#1E3A5F] text-sm text-[#94A3B8] hover:text-[#F0F4F8] transition-colors"
                >
                  <span className="flex-1 truncate">{f.name}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
