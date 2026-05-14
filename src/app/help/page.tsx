import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Help & FAQ',
  description: 'Answers to common questions about using Prezva for event management.',
}

const FAQS = [
  {
    q: 'How do I create my first event?',
    a: 'From your dashboard, click "Create event" or go to Events → New Event. Fill in the event details, add at least one ticket type, then publish your event page. The whole process takes under 5 minutes.',
  },
  {
    q: 'How does QR code check-in work?',
    a: 'Every confirmed registration gets a unique QR code sent by email. On event day, open the Check-In page on any device and scan attendees\' codes — or search by name. Check-in works offline, so venue WiFi problems won\'t stop you. Data syncs automatically when you reconnect.',
  },
  {
    q: 'How do payments work? When do I receive my money?',
    a: 'Prezva uses Stripe Connect. When you connect your Stripe account under Org Settings → Payments, ticket revenue goes directly to your bank — Prezva never holds your funds. Payouts follow your Stripe payout schedule (usually 2 business days after a charge).',
  },
  {
    q: 'Can I issue CE credit certificates?',
    a: 'Yes. Enable CE Credits on your event settings page, set the credit hours per session or for the full event, and certificates are generated automatically for attendees who met the attendance threshold. Certificates include a verification URL so licensing boards can confirm authenticity.',
  },
  {
    q: 'How do I print badges?',
    a: 'Go to your event → Badges, choose a template (portrait, landscape, or thermal ZPL), and click Print All or reprint individual badges. Thermal-compatible templates work with Zebra ZPL printers. Color templates require a standard inkjet or laser printer.',
  },
  {
    q: 'How do I invite team members or volunteers?',
    a: 'For team members with dashboard access, go to Org Settings → Team and send an invite by email. For volunteers, use the Volunteers module on your event — add them by name and role, and they\'ll receive a portal link with no login required.',
  },
  {
    q: 'What happens if an attendee cancels or wants a refund?',
    a: 'For free events, you can cancel a registration from the Attendees tab. For paid events, issue refunds from the Attendees tab — Prezva processes the refund through Stripe back to the original payment method. Partial refunds are supported.',
  },
  {
    q: 'How do I contact support?',
    a: 'Email support@prezva.app with your organization name and a description of the issue. We respond within 1 business day. For urgent event-day issues, include "URGENT" in the subject line.',
  },
]

export default function HelpPage() {
  return (
    <div style={{ background: 'var(--pz-bg)', minHeight: '100vh', color: 'var(--pz-text)' }}>
      <header
        style={{
          borderBottom: '1px solid var(--pz-border)',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          href="/"
          style={{ fontWeight: 800, fontSize: 18, color: 'var(--pz-teal)', textDecoration: 'none' }}
        >
          Prezva
        </Link>
        <Link
          href="/dashboard"
          style={{ fontSize: 13, color: 'var(--pz-text-muted)', textDecoration: 'none' }}
        >
          Back to dashboard
        </Link>
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          Help &amp; FAQ
        </h1>
        <p style={{ color: 'var(--pz-text-muted)', marginBottom: '3rem', fontSize: 15 }}>
          Common questions about using Prezva.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {FAQS.map(({ q, a }) => (
            <details
              key={q}
              style={{
                border: '1px solid var(--pz-border)',
                borderRadius: 10,
                padding: '1rem 1.25rem',
                background: 'var(--pz-surface)',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 15,
                  color: 'var(--pz-text)',
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                {q}
                <span style={{ color: 'var(--pz-teal)', flexShrink: 0, fontSize: 18 }}>+</span>
              </summary>
              <p
                style={{
                  marginTop: '0.75rem',
                  color: 'var(--pz-text-muted)',
                  fontSize: 14,
                  lineHeight: 1.7,
                }}
              >
                {a}
              </p>
            </details>
          ))}
        </div>

        <div
          style={{
            marginTop: '3rem',
            padding: '1.5rem',
            border: '1px solid var(--pz-border)',
            borderRadius: 12,
            background: 'rgba(0,191,166,0.05)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Still have questions?</p>
          <p style={{ color: 'var(--pz-text-muted)', fontSize: 14, marginBottom: '1rem' }}>
            Our support team usually responds within 1 business day.
          </p>
          <a
            href="mailto:support@prezva.app"
            style={{
              display: 'inline-block',
              background: 'var(--pz-teal)',
              color: '#0D1B2A',
              padding: '0.6rem 1.5rem',
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            Email support
          </a>
        </div>
      </main>
    </div>
  )
}
