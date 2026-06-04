'use client'
import { useState } from 'react'

export function StaffOnboardingModal({ userId, orgName }: { userId: string; orgName: string }) {
  const key = `prezva_staff_onboarded_${userId}`
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem(key)
  })

  function dismiss() {
    localStorage.setItem(key, '1')
    setShow(false)
  }

  if (!show) return null

  const steps = [
    { icon: '📷', title: 'Check-in Scanner', desc: "Scan attendee QR codes at the door from Check-in in the event menu." },
    { icon: '👥', title: 'Attendee Search', desc: 'Look up any attendee by name or email in the Attendees section.' },
    { icon: '✓', title: 'Manual Check-in', desc: "Click an attendee's name and use Manual Check-in if their QR won't scan." },
    { icon: '🙋', title: 'Volunteers', desc: 'See volunteer assignments and respond to alerts in the Volunteers section.' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                  zIndex: 9999, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ background: 'var(--pz-bg)', borderRadius: 16, padding: '2rem',
                    maxWidth: 420, width: '100%', border: '1px solid var(--pz-border)' }}>
        <h2 style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: 4 }}>
          Welcome to {orgName}
        </h2>
        <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginBottom: '1.5rem' }}>
          Here&apos;s a quick guide to what you can do as a staff member.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.5rem' }}>
          {steps.map(s => (
            <div key={s.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{s.icon}</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px' }}>{s.title}</p>
                <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: 0 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={dismiss}
          style={{ width: '100%', padding: '0.875rem', borderRadius: 10, border: 'none',
                   background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', fontWeight: 700,
                   fontSize: 15, cursor: 'pointer' }}>
          Got it, let&apos;s go →
        </button>
      </div>
    </div>
  )
}
