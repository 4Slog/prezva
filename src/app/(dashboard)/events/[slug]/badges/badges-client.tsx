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
  const [orgTpls] = useState(initialOrg)
  const [saving, setSaving] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
    setEventTpls(prev => [...prev, inserted as BadgeTemplate])
    setSuccess('Template copied to this event.')
  }

  const cardCls = 'pz-card p-4 flex items-center justify-between'

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-[#EF4444] bg-[#EF4444]/10 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-[#00BFA6] bg-[#00BFA6]/10 rounded-lg px-3 py-2">{success}</p>}

      {/* Event templates */}
      <section>
        <h2 className="text-sm font-semibold text-[#F0F4F8] mb-3">This event&apos;s templates</h2>
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
                <div>
                  <p className="text-sm font-medium text-[#F0F4F8]">{t.name}</p>
                  <p className="text-xs text-[#64748B]">{t.paper_size}</p>
                </div>
                <button
                  onClick={() => handleSaveToOrg(t.id)}
                  disabled={saving === t.id}
                  className="text-xs text-[#00BFA6] hover:underline disabled:opacity-50"
                >
                  {saving === t.id ? 'Saving…' : 'Save to org library'}
                </button>
              </div>
            ))}
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
                <div>
                  <p className="text-sm font-medium text-[#F0F4F8]">{t.name}</p>
                  <p className="text-xs text-[#64748B]">{t.paper_size}</p>
                </div>
                <button
                  onClick={() => handleCopyToEvent(t.id)}
                  disabled={copying === t.id}
                  className="rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-50"
                  style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                >
                  {copying === t.id ? 'Copying…' : 'Use template'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
