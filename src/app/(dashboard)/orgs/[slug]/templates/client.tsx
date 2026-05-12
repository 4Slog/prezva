'use client'

import { useState, useTransition } from 'react'
import { deleteOrgTemplate } from '@/lib/templates/actions'
import type { OrgTemplate, TemplateSurface } from '@/lib/templates/types'

const SURFACE_LABELS: Record<TemplateSurface, string> = {
  survey: 'Survey',
  badge: 'Badge',
  event: 'Event',
  announcement: 'Announcement',
  icebreaker: 'Icebreaker',
  trivia: 'Trivia',
}

const SURFACE_COLOR: Record<TemplateSurface, string> = {
  survey: '#3b82f6',
  badge: '#8b5cf6',
  event: '#00BFA6',
  announcement: '#f59e0b',
  icebreaker: '#ec4899',
  trivia: '#ef4444',
}

interface Props {
  templates: OrgTemplate[]
  orgSlug: string
}

export function OrgTemplatesClient({ templates: init, orgSlug: _orgSlug }: Props) {
  const [templates, setTemplates] = useState(init)
  const [filterSurface, setFilterSurface] = useState<TemplateSurface | 'all'>('all')
  const [pending, startTransition] = useTransition()

  const surfaces = Array.from(new Set(templates.map(t => t.surface))) as TemplateSurface[]

  const shown = filterSurface === 'all'
    ? templates
    : templates.filter(t => t.surface === filterSurface)

  function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return
    startTransition(async () => {
      const res = await deleteOrgTemplate(id)
      if (!res.error) setTemplates(prev => prev.filter(t => t.id !== id))
    })
  }

  return (
    <div>
      {/* Filter tabs */}
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

      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--pz-muted)', fontSize: 14 }}>
          No templates saved yet. When you create a survey, announcement, or other content, check &quot;Save as template&quot; to add it here.
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
              <button
                onClick={() => handleDelete(t.id)}
                disabled={pending}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pz-muted)', fontSize: 18, lineHeight: 1, padding: 4 }}
                aria-label="Delete template"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
