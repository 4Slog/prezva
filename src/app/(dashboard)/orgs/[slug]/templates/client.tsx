'use client'

import { useState, useTransition } from 'react'
import { deleteOrgTemplate } from '@/lib/templates/actions'
import type { OrgTemplate, TemplateSurface } from '@/lib/templates/types'

interface EventTemplate { id: string; name: string; description: string | null; created_at: string }

const SURFACE_LABELS: Record<TemplateSurface, string> = {
  survey: 'Survey',
  badge: 'Badge',
  event: 'Event',
  announcement: 'Announcement',
  icebreaker: 'Icebreaker',
  trivia: 'Trivia',
  certificate: 'Certificate',
}

const SURFACE_COLOR: Record<TemplateSurface, string> = {
  survey: '#3b82f6',
  badge: '#8b5cf6',
  event: '#2DD4BF',
  announcement: 'var(--pz-warning-fill)',
  icebreaker: '#ec4899',
  trivia: 'var(--pz-error)',
  certificate: '#B8860B',
}

interface Props {
  templates: OrgTemplate[]
  eventTemplates?: EventTemplate[]
  orgSlug: string
}

export function OrgTemplatesClient({ templates: init, eventTemplates = [], orgSlug }: Props) {
  const [templates, setTemplates] = useState(init)
  const [filterSurface, setFilterSurface] = useState<TemplateSurface | 'all'>('all')
  const [pending, startTransition] = useTransition()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const surfaces = Array.from(new Set(templates.map(t => t.surface))) as TemplateSurface[]

  const shown = filterSurface === 'all'
    ? templates
    : templates.filter(t => t.surface === filterSurface)

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteOrgTemplate(id)
      if (!res.error) setTemplates(prev => prev.filter(t => t.id !== id))
      setDeleteId(null)
    })
  }

  return (
    <div>
      {/* Event templates section */}
      {eventTemplates.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Event Templates ({eventTemplates.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {eventTemplates.map(t => (
              <div key={t.id} style={{ border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1rem 1.25rem', background: 'var(--pz-surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#00BFA622', color: '#2DD4BF', flexShrink: 0, textTransform: 'uppercase' }}>
                  Event
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ color: 'var(--pz-text)', fontWeight: 600, fontSize: 14, margin: 0 }}>{t.name}</p>
                  {t.description && (
                    <p style={{ color: 'var(--pz-muted)', fontSize: 12, margin: 0 }}>{t.description}</p>
                  )}
                  <p style={{ color: 'var(--pz-muted)', fontSize: 11, margin: '2px 0 0' }}>
                    Saved {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <a
                  href={`/events/new?templateId=${t.id}`}
                  style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: 'var(--pz-teal)', color: '#0D1B2A', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}
                >
                  Use template
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content templates section */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Content Templates ({templates.length})
      </h2>

      {/* Filter tabs */}
      {templates.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {(['all', ...surfaces] as (TemplateSurface | 'all')[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterSurface(s)}
              style={{
                border: 'none', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: filterSurface === s
                  ? (s === 'all' ? 'var(--pz-teal)' : SURFACE_COLOR[s])
                  : 'var(--pz-surface)',
                color: filterSurface === s ? '#0D1B2A' : 'var(--pz-muted)',
              }}
            >
              {s === 'all' ? `All (${templates.length})` : `${SURFACE_LABELS[s]} (${templates.filter(t => t.surface === s).length})`}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--pz-muted)', fontSize: 14 }}>
          {eventTemplates.length === 0
            ? 'No templates saved yet. Save an event as a template, or save announcements, surveys, and badges as templates to reuse them here.'
            : 'No content templates yet. Save announcements, surveys, and badges as templates to reuse them.'
          }
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(t => (
            <div
              key={t.id}
              style={{ border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1rem 1.25rem', background: 'var(--pz-surface)', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <span
                style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: SURFACE_COLOR[t.surface] + '22', color: SURFACE_COLOR[t.surface], flexShrink: 0, textTransform: 'uppercase' }}
              >
                {SURFACE_LABELS[t.surface]}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--pz-text)', fontWeight: 600, fontSize: 14, margin: 0 }}>{t.name}</p>
                {t.description && (
                  <p style={{ color: 'var(--pz-muted)', fontSize: 12, margin: 0 }}>{t.description}</p>
                )}
              </div>
              <span style={{ color: 'var(--pz-muted)', fontSize: 12, flexShrink: 0 }}>
                Used {t.usage_count}×
              </span>
              {deleteId === t.id ? (
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>Delete?</span>
                  <button onClick={() => handleDelete(t.id)} disabled={pending}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--pz-error)', background: 'transparent', color: 'var(--pz-error)', cursor: 'pointer' }}>Yes</button>
                  <button onClick={() => setDeleteId(null)}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--pz-border)', background: 'transparent', color: 'var(--pz-muted)', cursor: 'pointer' }}>No</button>
                </span>
              ) : (
                <button
                  onClick={() => setDeleteId(t.id)}
                  disabled={pending}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pz-muted)', fontSize: 18, lineHeight: 1, padding: 4 }}
                  aria-label="Delete template"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
