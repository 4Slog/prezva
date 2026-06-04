'use client'

import { useState, useTransition } from 'react'
import { updateMyPreferences } from '@/lib/attendees/preferences-actions'

interface Prefs {
  email_announcements: boolean
  email_reminders: boolean
  email_surveys: boolean
  email_marketing: boolean
  push_announcements: boolean
  push_reminders: boolean
  networking_show_in_dir: boolean
  networking_accept_matches: boolean
  networking_allow_dms: boolean
}

const DEFAULTS: Prefs = {
  email_announcements: true,
  email_reminders: true,
  email_surveys: true,
  email_marketing: false,
  push_announcements: true,
  push_reminders: true,
  networking_show_in_dir: false,
  networking_accept_matches: true,
  networking_allow_dms: true,
}

export function PreferencesClient({ initial }: { initial: (Prefs & { user_id?: string }) | null }) {
  const [prefs, setPrefs] = useState<Prefs>({
    email_announcements: initial?.email_announcements ?? DEFAULTS.email_announcements,
    email_reminders: initial?.email_reminders ?? DEFAULTS.email_reminders,
    email_surveys: initial?.email_surveys ?? DEFAULTS.email_surveys,
    email_marketing: initial?.email_marketing ?? DEFAULTS.email_marketing,
    push_announcements: initial?.push_announcements ?? DEFAULTS.push_announcements,
    push_reminders: initial?.push_reminders ?? DEFAULTS.push_reminders,
    networking_show_in_dir: initial?.networking_show_in_dir ?? DEFAULTS.networking_show_in_dir,
    networking_accept_matches: initial?.networking_accept_matches ?? DEFAULTS.networking_accept_matches,
    networking_allow_dms: initial?.networking_allow_dms ?? DEFAULTS.networking_allow_dms,
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function toggle(k: keyof Prefs) {
    setPrefs(p => ({ ...p, [k]: !p[k] }))
    setSaved(false)
  }

  function handleSave() {
    setError('')
    startTransition(async () => {
      const res = await updateMyPreferences(prefs)
      if (res.error) {
        setError(res.error)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <div>
      <Section title="Email notifications">
        {([
          { key: 'email_announcements', label: 'Event announcements', sub: 'Updates from event organizers' },
          { key: 'email_reminders', label: 'Event reminders', sub: 'Day-before and morning-of reminders' },
          { key: 'email_surveys', label: 'Post-event surveys', sub: 'Feedback requests after events' },
          { key: 'email_marketing', label: 'Product news', sub: 'Tips, new features, and offers from Prezva' },
        ] as { key: keyof Prefs; label: string; sub: string }[]).map(item => (
          <ToggleRow key={item.key} label={item.label} sub={item.sub} checked={prefs[item.key]} onChange={() => toggle(item.key)} />
        ))}
      </Section>

      <Section title="Push notifications">
        {([
          { key: 'push_announcements', label: 'Event announcements', sub: 'Push alerts from organizers' },
          { key: 'push_reminders', label: 'Event reminders', sub: 'Push reminders before events' },
        ] as { key: keyof Prefs; label: string; sub: string }[]).map(item => (
          <ToggleRow key={item.key} label={item.label} sub={item.sub} checked={prefs[item.key]} onChange={() => toggle(item.key)} />
        ))}
      </Section>

      <Section title="Networking">
        {([
          { key: 'networking_show_in_dir', label: 'Show in attendee directory', sub: 'Other attendees can find you' },
          { key: 'networking_accept_matches', label: 'Accept networking matches', sub: 'Allow AI-powered introductions' },
          { key: 'networking_allow_dms', label: 'Allow direct messages', sub: 'Let other attendees message you' },
        ] as { key: keyof Prefs; label: string; sub: string }[]).map(item => (
          <ToggleRow key={item.key} label={item.label} sub={item.sub} checked={prefs[item.key]} onChange={() => toggle(item.key)} />
        ))}
      </Section>

      {error && <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button
        onClick={handleSave}
        disabled={isPending}
        style={{ padding: '10px 28px', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
      >
        {isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save preferences'}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem 1.5rem', marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 14 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function ToggleRow({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <p style={{ fontSize: 14, color: 'var(--pz-text)', marginBottom: 1 }}>{label}</p>
        <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>{sub}</p>
      </div>
      <label style={{ position: 'relative', display: 'inline-block', width: 42, height: 24, cursor: 'pointer', flexShrink: 0 }}>
        <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{ position: 'absolute', inset: 0, background: checked ? 'var(--pz-teal)' : 'var(--pz-border)', borderRadius: 24, transition: 'background 0.2s' }} />
        <span style={{ position: 'absolute', width: 18, height: 18, top: 3, left: checked ? 21 : 3, background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
      </label>
    </div>
  )
}
