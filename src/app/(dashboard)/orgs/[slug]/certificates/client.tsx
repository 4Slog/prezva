'use client'

import { useState, useTransition } from 'react'
import { upsertCertificateTemplate } from '@/lib/certificates/actions'
import { Field } from '@/components/ui/Field'

interface Template {
  id: string
  name: string
  is_default: boolean
  payload: {
    accent_color?: string
    title?: string
    body?: string
    footer?: string
    signature_image_url?: string | null
  }
}

const PLACEHOLDER_REF = [
  '{attendee_name}', '{event_title}', '{event_date}',
  '{sessions_attended}', '{ce_credit_hours}', '{org_name}', '{verification_url}',
]

export function CertificatesClient({ orgId, templates }: { orgId: string; templates: Template[] }) {
  const [list, setList] = useState<Template[]>(templates)
  const [editing, setEditing] = useState<Partial<Template> | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function startNew() {
    setEditing({
      name: 'New Template',
      is_default: list.length === 0,
      payload: {
        // eslint-disable-next-line no-restricted-syntax
        accent_color: '#2DD4BF',
        title: 'Certificate of Attendance',
        body: 'This certifies that {attendee_name} attended {event_title} on {event_date} for {ce_credit_hours} CE credit hours.',
        footer: 'Issued by {org_name} | Verify at {verification_url}',
      },
    })
    setError('')
  }

  function handleSave() {
    if (!editing) return
    setError('')
    startTransition(async () => {
      const res = await upsertCertificateTemplate(orgId, {
        id: editing.id,
        name: editing.name ?? 'Template',
        isDefault: editing.is_default ?? false,
        payload: editing.payload ?? {},
      })
      if (res.error) {
        setError(res.error)
      } else {
        setEditing(null)
        window.location.reload()
      }
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    background: 'var(--pz-bg)',
    border: '1px solid var(--pz-border)',
    borderRadius: 6,
    color: 'var(--pz-text)',
    fontSize: 13,
    boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={startNew}
          style={{ padding: '8px 18px', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + New template
        </button>
      </div>

      {list.length === 0 && !editing && (
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 14 }}>
          No certificate templates yet. Create one to enable certificate issuance for your events.
        </div>
      )}

      {list.map(t => (
        <div key={t.id} style={{ background: 'var(--pz-surface)', border: `1px solid ${t.is_default ? 'var(--pz-teal)' : 'var(--pz-border)'}`, borderRadius: 10, padding: '1.25rem', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 2 }}>{t.name}</p>
            <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
              Accent: <span style={{ color: t.payload.accent_color ?? '#2DD4BF' }}>{t.payload.accent_color ?? '#2DD4BF'}</span>
              {t.is_default && <span style={{ marginLeft: 8, color: 'var(--pz-teal)', fontWeight: 600 }}>Default</span>}
            </p>
          </div>
          <button
            onClick={() => { setEditing({ ...t }); setError('') }}
            style={{ fontSize: 12, color: 'var(--pz-teal)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
          >
            Edit
          </button>
        </div>
      ))}

      {editing && (
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-teal)', borderRadius: 10, padding: '1.5rem', marginTop: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 16 }}>
            {editing.id ? 'Edit template' : 'New template'}
          </h3>

          <div style={{ marginBottom: 12 }}>
            <Field label="Template name" htmlFor="cert-name">
              <input id="cert-name" value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))} style={inputStyle} />
            </Field>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--pz-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Accent color</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={editing.payload?.accent_color ?? '#2DD4BF'}
                onChange={e => setEditing(p => ({ ...p!, payload: { ...p!.payload, accent_color: e.target.value } }))}
                style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', background: 'none' }}
              />
              <input
                value={editing.payload?.accent_color ?? '#2DD4BF'}
                onChange={e => setEditing(p => ({ ...p!, payload: { ...p!.payload, accent_color: e.target.value } }))}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <Field label="Title" htmlFor="cert-title">
              <input id="cert-title" value={editing.payload?.title ?? ''} onChange={e => setEditing(p => ({ ...p!, payload: { ...p!.payload, title: e.target.value } }))} style={inputStyle} />
            </Field>
          </div>

          <div style={{ marginBottom: 12 }}>
            <Field label="Body text" htmlFor="cert-body">
              <textarea
                id="cert-body"
                value={editing.payload?.body ?? ''}
                onChange={e => setEditing(p => ({ ...p!, payload: { ...p!.payload, body: e.target.value } }))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Field label="Footer" htmlFor="cert-footer">
              <input id="cert-footer" value={editing.payload?.footer ?? ''} onChange={e => setEditing(p => ({ ...p!, payload: { ...p!.payload, footer: e.target.value } }))} style={inputStyle} />
            </Field>
          </div>

          <div style={{ marginBottom: 14, padding: '10px', background: 'var(--pz-bg)', borderRadius: 6, border: '1px solid var(--pz-border)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--pz-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Available placeholders</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PLACEHOLDER_REF.map(p => (
                <code key={p} style={{ fontSize: 11, background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', padding: '2px 6px', borderRadius: 4 }}>{p}</code>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--pz-text)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editing.is_default ?? false}
                onChange={e => setEditing(p => ({ ...p!, is_default: e.target.checked }))}
              />
              Set as default template
            </label>
          </div>

          {error && <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: 10 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={isPending}
              style={{ padding: '8px 20px', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
            >
              {isPending ? 'Saving…' : 'Save template'}
            </button>
            <button
              onClick={() => setEditing(null)}
              style={{ padding: '8px 16px', background: 'var(--pz-bg)', color: 'var(--pz-muted)', border: '1px solid var(--pz-border)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
