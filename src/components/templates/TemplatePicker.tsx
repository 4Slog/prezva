'use client'

import { useState, useEffect, useRef } from 'react'
import type { TemplateSurface, OrgTemplate } from '@/lib/templates/types'
import { getGlobalTemplates } from '@/lib/templates/index'

interface TemplateCard {
  id: string
  name: string
  description?: string
  tags?: string[]
  isOrg?: boolean
  payload?: Record<string, unknown>
  raw?: unknown
}

interface Props {
  surface: TemplateSurface
  orgId: string
  orgTemplates?: OrgTemplate[]
  onPick: (template: unknown, isOrg: boolean) => void
  onClose: () => void
}

export function TemplatePicker({ surface, orgId: _orgId, orgTemplates = [], onPick, onClose }: Props) {
  const [tab, setTab] = useState<'global' | 'org'>('global')
  const overlayRef = useRef<HTMLDivElement>(null)

  const globalItems = getGlobalTemplates(surface) as TemplateCard[]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  const globalCards: TemplateCard[] = globalItems.map((t) => ({
    id: t.id ?? String(t),
    name: t.name ?? '',
    description: t.description ?? '',
    tags: t.tags ?? [],
    raw: t,
  }))

  const orgCards: TemplateCard[] = orgTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    tags: [],
    isOrg: true,
    payload: t.payload as Record<string, unknown>,
    raw: t,
  }))

  const shownCards = tab === 'global' ? globalCards : orgCards

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a template"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--pz-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ color: 'var(--pz-text)', fontSize: 18, fontWeight: 700, margin: 0 }}>Choose a template</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pz-muted)', fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '0.75rem 1.5rem 0', borderBottom: '1px solid var(--pz-border)' }}>
          {(['global', 'org'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.5rem 1rem',
                fontSize: 13, fontWeight: 600,
                color: tab === t ? 'var(--pz-teal)' : 'var(--pz-muted)',
                borderBottom: tab === t ? '2px solid var(--pz-teal)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t === 'global' ? 'Starter templates' : `Your saved templates (${orgTemplates.length})`}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', flex: 1 }}>
          {shownCards.length === 0 ? (
            <p style={{ color: 'var(--pz-muted)', fontSize: 13, textAlign: 'center', marginTop: '2rem' }}>
              {tab === 'org' ? "No saved templates yet. Use a starter template and check \"Save as template\" to add your own." : "No templates available."}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {shownCards.map((card) => (
                <div
                  key={card.id}
                  style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <p style={{ color: 'var(--pz-text)', fontSize: 14, fontWeight: 600, margin: 0 }}>{card.name}</p>
                  {card.description && (
                    <p style={{ color: 'var(--pz-muted)', fontSize: 12, margin: 0, lineHeight: 1.4 }}>{card.description}</p>
                  )}
                  {card.tags && card.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                      {card.tags.map((tag) => (
                        <span key={tag} style={{ background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => onPick(card.raw, !!card.isOrg)}
                    style={{ marginTop: 'auto', paddingTop: 6, background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 6, padding: '0.4rem 0.75rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Use template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — Start blank */}
        <div style={{ padding: '0.875rem 1.5rem', borderTop: '1px solid var(--pz-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => onPick(null, false)}
            style={{ background: 'none', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '0.4rem 1rem', fontSize: 13, color: 'var(--pz-muted)', cursor: 'pointer' }}
          >
            Start blank
          </button>
        </div>
      </div>
    </div>
  )
}
