'use client'

import { useState } from 'react'
import { saveAsOrgTemplate } from '@/lib/productivity/sprint11-actions'
import { updateBadgeRules } from '@/lib/events/actions'
import { createClient } from '@/lib/supabase/client'
import { BADGE_TEMPLATES } from '@/lib/templates/badges'

interface BadgeTemplate {
  id: string
  name: string
  paper_size: string
  is_template?: boolean
}

interface TicketType {
  id: string
  name: string
}

interface BadgeRule {
  condition: 'is_speaker' | 'is_press' | 'ticket_type' | 'default'
  ticketTypeId?: string
  templateId: string
}

interface Props {
  eventId: string
  orgId: string
  eventSlug: string
  eventTemplates: BadgeTemplate[]
  orgTemplates: BadgeTemplate[]
  badgeRules: BadgeRule[]
  ticketTypes: TicketType[]
}

export function BadgesClient({ eventId, orgId, eventSlug, eventTemplates: initial, orgTemplates: initialOrg, badgeRules: initialRules, ticketTypes }: Props) {
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
  const [rules, setRules] = useState<BadgeRule[]>(initialRules)
  const [savingRules, setSavingRules] = useState(false)

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

  async function handleSaveRules() {
    setSavingRules(true)
    setError('')
    const result = await updateBadgeRules(eventId, rules)
    setSavingRules(false)
    if (result && 'error' in result) setError(result.error ?? 'Failed to save rules')
    else setSuccess('Badge rules saved.')
  }

  function addRule() {
    setRules(prev => [...prev, { condition: 'default', templateId: defaultTemplateId ?? '' }])
  }

  function updateRule(index: number, patch: Partial<BadgeRule>) {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))
  }

  function removeRule(index: number) {
    setRules(prev => prev.filter((_, i) => i !== index))
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
      {error && <p className="text-sm text-[var(--pz-error)] bg-[var(--pz-error)]/10 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-[var(--pz-teal-ink)] bg-[var(--pz-teal-bg)] rounded-lg px-3 py-2">{success}</p>}

      {/* Event templates */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--pz-text)]">This event&apos;s templates</h2>
          {defaultTemplateId && (
            <div className="flex items-center gap-2">
              <a
                href={`/api/events/${eventId}/badges/print?templateId=${defaultTemplateId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-muted)' }}
              >
                Print all attendees
              </a>
            </div>
          )}
        </div>

        {eventTpls.length === 0 ? (
          <div className="pz-card p-6 text-center space-y-3">
            <p className="text-sm text-[var(--pz-muted)]">No badge templates for this event yet.</p>
            <div className="flex justify-center gap-3">
              <a
                href={`/events/${eventSlug}/badges/new`}
                className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
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
                          ? 'bg-[var(--pz-teal)] border-[var(--pz-teal)]'
                          : 'bg-transparent border-[var(--pz-muted)]'
                      }`} />
                    </button>
                    <div>
                      <p className="text-sm font-medium text-[var(--pz-text)]">{t.name}</p>
                      <p className="text-xs text-[var(--pz-muted)]">{t.paper_size}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Preview */}
                    <a
                      href={`/api/events/${eventId}/badges/print?templateId=${t.id}&preview=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border px-3 py-1 text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-muted)' }}
                    >
                      Preview
                    </a>
                    {/* Print all attendees */}
                    <a
                      href={`/api/events/${eventId}/badges/print?templateId=${t.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-90"
                      style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
                    >
                      Print all
                    </a>
                    <button
                      onClick={() => handleSaveToOrg(t.id)}
                      disabled={saving === t.id}
                      className="text-xs text-[var(--pz-teal-ink)] hover:underline disabled:opacity-50"
                    >
                      {saving === t.id ? 'Saving…' : 'Save to org library'}
                    </button>
                    {confirmDelete === t.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-[var(--pz-muted)]">Delete?</span>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deleting === t.id}
                          className="text-xs text-[var(--pz-error)] hover:underline disabled:opacity-50"
                        >
                          {deleting === t.id ? 'Deleting…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-[var(--pz-muted)] hover:underline"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(t.id)}
                        className="text-xs text-[var(--pz-error)] hover:underline opacity-50 hover:opacity-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-[var(--pz-muted)] mt-1 px-1">
              ● = default template used for &quot;Print all attendees&quot; above. Click a dot to change it.
            </p>
          </div>
        )}
      </section>

      {/* Org template library */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-3">Org template library</h2>
        {orgTpls.length === 0 ? (
          <p className="text-sm text-[var(--pz-muted)]">No org-level templates yet. Save an event template above to add one.</p>
        ) : (
          <div className="space-y-2">
            {orgTpls.map(t => (
              <div key={t.id} className={cardCls}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--pz-text)]">{t.name}</p>
                    <p className="text-xs text-[var(--pz-muted)]">{t.paper_size}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyToEvent(t.id)}
                      disabled={copying === t.id}
                      className="rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-50"
                      style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
                    >
                      {copying === t.id ? 'Copying…' : 'Use template'}
                    </button>
                    {confirmDeleteOrg === t.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-[var(--pz-muted)]">Delete?</span>
                        <button
                          onClick={() => handleDeleteOrg(t.id)}
                          disabled={deletingOrg === t.id}
                          className="text-xs text-[var(--pz-error)] hover:underline disabled:opacity-50"
                        >
                          {deletingOrg === t.id ? 'Deleting…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteOrg(null)}
                          className="text-xs text-[var(--pz-muted)] hover:underline"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteOrg(t.id)}
                        className="text-xs text-[var(--pz-error)] hover:underline opacity-50 hover:opacity-100"
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

      {/* Badge Rules */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--pz-text)]">Badge rules</h2>
            <p className="text-xs text-[var(--pz-muted)] mt-0.5">Map conditions to templates. Evaluated in order — first match wins.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={addRule}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-muted)' }}
            >
              + Add rule
            </button>
            <button
              onClick={handleSaveRules}
              disabled={savingRules}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              {savingRules ? 'Saving…' : 'Save rules'}
            </button>
          </div>
        </div>

        {rules.length === 0 ? (
          <p className="text-xs text-[var(--pz-muted)]">No rules yet. Without rules, all badges use the default template selected above.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, i) => {
              const allTemplates = [
                ...BADGE_TEMPLATES.map(t => ({ id: t.id, name: t.name })),
                ...eventTpls.map(t => ({ id: t.id, name: `${t.name} (this event)` })),
                ...orgTpls.map(t => ({ id: t.id, name: `${t.name} (org)` })),
              ]
              return (
                <div key={i} className="pz-card p-3 flex items-center gap-3 flex-wrap">
                  <select
                    value={rule.condition}
                    onChange={e => updateRule(i, { condition: e.target.value as BadgeRule['condition'], ticketTypeId: undefined })}
                    className="rounded-md border px-2 py-1 text-xs bg-transparent"
                    style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }}
                  >
                    <option value="is_speaker">Is a confirmed speaker</option>
                    <option value="is_press">Is a press ticket</option>
                    <option value="ticket_type">Ticket type is…</option>
                    <option value="default">Default (everyone else)</option>
                  </select>

                  {rule.condition === 'ticket_type' && (
                    <select
                      value={rule.ticketTypeId ?? ''}
                      onChange={e => updateRule(i, { ticketTypeId: e.target.value })}
                      className="rounded-md border px-2 py-1 text-xs bg-transparent"
                      style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }}
                    >
                      <option value="">— pick a ticket type —</option>
                      {ticketTypes.map(tt => (
                        <option key={tt.id} value={tt.id}>{tt.name}</option>
                      ))}
                    </select>
                  )}

                  <span className="text-xs text-[var(--pz-muted)]">→</span>

                  <select
                    value={rule.templateId}
                    onChange={e => updateRule(i, { templateId: e.target.value })}
                    className="rounded-md border px-2 py-1 text-xs bg-transparent flex-1 min-w-[160px]"
                    style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }}
                  >
                    <option value="">— pick a template —</option>
                    {allTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => removeRule(i)}
                    className="text-xs text-[var(--pz-error)] hover:underline opacity-60 hover:opacity-100 ml-auto"
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
