'use client'

import { useState } from 'react'
import { saveAsOrgTemplate } from '@/lib/productivity/sprint11-actions'
import { createClient } from '@/lib/supabase/client'

interface BadgeTemplate {
  id: string
  name: string
  paper_size: string
  is_template?: boolean
}

interface Props {
  eventId: string
  orgId: string
  eventSlug: string
  eventTemplates: BadgeTemplate[]
  orgTemplates: BadgeTemplate[]
}

export function BadgesClient({ eventId, orgId, eventSlug, eventTemplates: initial, orgTemplates: initialOrg }: Props) {
  const [eventTpls, setEventTpls] = useState(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deletingOrg, setDeletingOrg] = useState<string | null>(null)
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState<string | null>(null)
  const [orgTpls, setOrgTpls] = useState(initialOrg)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(
    initial.length > 0 ? initial[0].id : null
  )

  async function handleSaveToOrg(templateId: string) {
    setSaving(templateId)
    setError('')
    const result = await saveAsOrgTemplate(templateId, orgId)
    setSaving(null)
    if (result.error) setError(result.error)
    else setSuccess('Template saved to org library.')
  }

  async function handleCopyToEvent(templateId: string) {
    setCopying(templateId)
    setError('')
    const supabase = createClient()
    const { data: tpl } = await supabase.from('badge_templates').select('*').eq('id', templateId).single()
    if (!tpl) { setCopying(null); setError('Template not found'); return }
    const { data: inserted, error: err } = await supabase.from('badge_templates').insert({
      event_id: eventId,
      org_id: orgId,
      name: (tpl as any).name,
      paper_size: (tpl as any).paper_size,
      template_json: (tpl as any).template_json,
      is_template: false,
    }).select('id, name, paper_size, is_template').single()
    setCopying(null)
    if (err) { setError(err.message); return }
    const newTpl = inserted as BadgeTemplate
    setEventTpls(prev => [...prev, newTpl])
    if (!defaultTemplateId) setDefaultTemplateId(newTpl.id)
    setSuccess('Template copied to this event.')
  }

  async function handleDelete(templateId: string) {
    setDeleting(templateId)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.from('badge_templates').delete().eq('id', templateId)
    setDeleting(null)
    setConfirmDelete(null)
    if (err) { setError(err.message); return }
    setEventTpls(prev => prev.filter(t => t.id !== templateId))
    if (defaultTemplateId === templateId) {
      const remaining = eventTpls.filter(t => t.id !== templateId)
      setDefaultTemplateId(remaining.length > 0 ? remaining[0].id : null)
    }
    setSuccess('Template deleted.')
  }

  async function handleDeleteOrg(templateId: string) {
    setDeletingOrg(templateId)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.from('badge_templates').delete().eq('id', templateId)
    setDeletingOrg(null)
    setConfirmDeleteOrg(null)
    if (err) { setError(err.message); return }
    setOrgTpls(prev => prev.filter(t => t.id !== templateId))
    setSuccess('Org template deleted.')
  }

  const cardCls = 'pz-card p-4'

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-[#EF4444] bg-[#EF4444]/10 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-[#00BFA6] bg-[#00BFA6]/10 rounded-lg px-3 py-2">{success}</p>}

      {/* Event templates */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#F0F4F8]">This event&apos;s templates</h2>
          {defaultTemplateId && (
            <div className="flex items-center gap-2">
              <a
                href={`/api/events/${eventId}/badges/print?templateId=${defaultTemplateId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-text-muted)' }}
              >
                Print all attendees
              </a>
            </div>
          )}
        </div>

        {eventTpls.length === 0 ? (
          <div className="pz-card p-6 text-center space-y-3">
            <p className="text-sm text-[#64748B]">No badge templates for this event yet.</p>
            <div className="flex justify-center gap-3">
              <a
                href={`/events/${eventSlug}/badges/new`}
                className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
              >
                + New badge template
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {eventTpls.map(t => (
              <div key={t.id} className={cardCls}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Default indicator */}
                    <button
                      onClick={() => setDefaultTemplateId(t.id)}
                      title={defaultTemplateId === t.id ? 'Default template for printing' : 'Set as default'}
                      className="flex-shrink-0"
                    >
                      <span className={`inline-block w-2.5 h-2.5 rounded-full border-2 ${
                        defaultTemplateId === t.id
                          ? 'bg-[#2DD4BF] border-[#2DD4BF]'
                          : 'bg-transparent border-[#475569]'
                      }`} />
                    </button>
                    <div>
                      <p className="text-sm font-medium text-[#F0F4F8]">{t.name}</p>
                      <p className="text-xs text-[#64748B]">{t.paper_size}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Preview */}
                    <a
                      href={`/api/events/${eventId}/badges/print?templateId=${t.id}&preview=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border px-3 py-1 text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-text-muted)' }}
                    >
                      Preview
                    </a>
                    {/* Print all attendees */}
                    <a
                      href={`/api/events/${eventId}/badges/print?templateId=${t.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-90"
                      style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                    >
                      Print all
                    </a>
                    <button
                      onClick={() => handleSaveToOrg(t.id)}
                      disabled={saving === t.id}
                      className="text-xs text-[#00BFA6] hover:underline disabled:opacity-50"
                    >
                      {saving === t.id ? 'Saving…' : 'Save to org library'}
                    </button>
                    {confirmDelete === t.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-[#94A3B8]">Delete?</span>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deleting === t.id}
                          className="text-xs text-[#EF4444] hover:underline disabled:opacity-50"
                        >
                          {deleting === t.id ? 'Deleting…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-[#94A3B8] hover:underline"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(t.id)}
                        className="text-xs text-[#EF4444] hover:underline opacity-50 hover:opacity-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-[#475569] mt-1 px-1">
              ● = default template used for &quot;Print all attendees&quot; above. Click a dot to change it.
            </p>
          </div>
        )}
      </section>

      {/* Org template library */}
      <section>
        <h2 className="text-sm font-semibold text-[#F0F4F8] mb-3">Org template library</h2>
        {orgTpls.length === 0 ? (
          <p className="text-sm text-[#64748B]">No org-level templates yet. Save an event template above to add one.</p>
        ) : (
          <div className="space-y-2">
            {orgTpls.map(t => (
              <div key={t.id} className={cardCls}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#F0F4F8]">{t.name}</p>
                    <p className="text-xs text-[#64748B]">{t.paper_size}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyToEvent(t.id)}
                      disabled={copying === t.id}
                      className="rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-50"
                      style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                    >
                      {copying === t.id ? 'Copying…' : 'Use template'}
                    </button>
                    {confirmDeleteOrg === t.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-[#94A3B8]">Delete?</span>
                        <button
                          onClick={() => handleDeleteOrg(t.id)}
                          disabled={deletingOrg === t.id}
                          className="text-xs text-[#EF4444] hover:underline disabled:opacity-50"
                        >
                          {deletingOrg === t.id ? 'Deleting…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteOrg(null)}
                          className="text-xs text-[#94A3B8] hover:underline"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteOrg(t.id)}
                        className="text-xs text-[#EF4444] hover:underline opacity-50 hover:opacity-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
