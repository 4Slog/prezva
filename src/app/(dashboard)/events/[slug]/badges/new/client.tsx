'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TemplatePicker } from '@/components/templates/TemplatePicker'
import { createClient } from '@/lib/supabase/client'
import type { BadgeTemplate } from '@/lib/templates/types'

interface EmbedBadgeNewActions {
  createTemplate: (eventId: string, tpl: BadgeTemplate) => Promise<{ id?: string; error?: string }>
  backHref: string
}

interface Props {
  eventId: string
  eventTitle: string
  orgId: string
  eventSlug: string
  embed?: EmbedBadgeNewActions
}

export function BadgeNewClient({ eventId, eventTitle, orgId, eventSlug, embed }: Props) {
  const [showPicker, setShowPicker] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const backHref = embed ? embed.backHref : `/events/${eventSlug}/badges`

  async function handleTemplatePick(raw: unknown) {
    setShowPicker(false)
    if (raw === null) {
      // Start blank — save empty template
      await saveTemplate({ id: 'blank', name: 'Custom Badge', description: '', layout: 'portrait', size: { width_mm: 89, height_mm: 102 }, fields: [] })
      return
    }
    await saveTemplate(raw as BadgeTemplate)
  }

  async function saveTemplate(tpl: BadgeTemplate) {
    setSaving(true)
    setError('')
    if (embed) {
      const result = await embed.createTemplate(eventId, tpl)
      setSaving(false)
      if (result.error) { setError(result.error); return }
      setSuccess(true)
      setTimeout(() => router.push(embed.backHref), 1200)
      return
    }
    const supabase = createClient()
    const { error: err } = await supabase.from('badge_templates').insert({
      event_id: eventId,
      org_id: orgId,
      name: tpl.name,
      paper_size: `${tpl.size?.width_mm ?? 89}x${tpl.size?.height_mm ?? 102}mm`,
      template_json: tpl,
      is_template: false,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setSuccess(true)
    setTimeout(() => router.push(`/events/${eventSlug}/badges`), 1200)
  }

  if (saving) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
        <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>Saving badge template…</p>
      </div>
    )
  }

  if (success) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: 'var(--pz-teal)', fontWeight: 600 }}>Template saved!</p>
        <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>Redirecting…</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <Link href={backHref} className="text-sm hover:underline" style={{ color: 'var(--pz-teal)' }}>
          ← Back to Badge templates
        </Link>
      </div>
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>New badge template</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--pz-muted)' }}>{eventTitle}</p>

      {error && <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: '1rem' }}>{error}</p>}

      {showPicker ? (
        <TemplatePicker
          surface="badge"
          orgId={orgId}
          onPick={handleTemplatePick}
          onClose={() => router.push(backHref)}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>
            No template selected. <button onClick={() => setShowPicker(true)} style={{ background: 'none', border: 'none', color: 'var(--pz-teal)', cursor: 'pointer', textDecoration: 'underline' }}>Pick a template</button>
          </p>
        </div>
      )}
    </div>
  )
}
