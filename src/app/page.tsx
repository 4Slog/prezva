'use client'

const FEATURES = [
  { icon: '🎟️', title: 'Registration & Ticketing', desc: 'Free, paid, and member-only tickets with Stripe Connect — direct payouts to your bank.' },
  { icon: '✅', title: 'Offline-First Check-in', desc: 'QR code scanning works without internet. Sync when back online. Never miss a check-in.' },
  { icon: '🎙️', title: 'Speaker Portal', desc: 'Invite speakers, collect bios, share handouts, send reminders. All automated.' },
  { icon: '🙋', title: 'Volunteer Management', desc: 'Assign shifts, track hours, send thank-yous. Your team runs smoothly.' },
  { icon: '💼', title: 'Sponsor Portal', desc: 'Lead scanning, ROI reports, booth editing. Sponsors love it.' },
  { icon: '📊', title: 'Real-Time Analytics', desc: 'Registration pace, check-in velocity, revenue breakdown. Know your event is on track.' },
  { icon: '🔗', title: '17 AMS Integrations', desc: 'Wild Apricot, iMIS, MemberClicks, and more. Your member database, your rules.' },
  { icon: '🎮', title: 'Attendee Engagement', desc: 'Trivia, icebreakers, passport challenges, leaderboards. Events people remember.' },
]

const TESTIMONIALS = [
  { quote: 'We replaced Whova and saved $8,000 at our annual conference.', author: 'Sarah M.', role: 'Events Director' },
  { quote: 'The offline check-in alone was worth switching. No more panic moments.', author: 'James T.', role: 'Association Manager' },
  { quote: 'Our speakers love the portal. Zero back-and-forth emails.', author: 'Priya K.', role: 'Conference Chair' },
]

export default function MarketingHomepage() {
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0D1B2A', color: '#F0F4F8', minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{ padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0,
                    background: '#0D1B2A', zIndex: 50 }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: '#2DD4BF', letterSpacing: -1 }}>Prezva</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/discover" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Browse Events</a>
          <a href="/login" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Sign in</a>
          <a href="/signup" style={{ fontSize: 14, fontWeight: 700, padding: '0.5rem 1.25rem',
                                      background: '#2DD4BF', color: '#0D1B2A', borderRadius: 8,
                                      textDecoration: 'none' }}>
            Get started free
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '5rem 2rem 4rem', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', background: '#2DD4BF22', color: '#2DD4BF',
                      padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>
          Event management for professional associations
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 900, lineHeight: 1.1,
                     margin: '0 0 1.5rem', letterSpacing: -1 }}>
          Run your whole event.<br />
          <span style={{ color: '#2DD4BF' }}>Not just sell tickets.</span>
        </h1>
        <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.25rem)', color: '#94A3B8', margin: '0 0 2.5rem',
                    lineHeight: 1.6, maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}>
          Prezva handles registration, check-in, speakers, volunteers, sponsors, and engagement
          in one platform — starting at $199/month flat.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/signup" style={{ padding: '0.875rem 2rem', borderRadius: 10, fontWeight: 800,
                                      fontSize: 16, background: '#2DD4BF', color: '#0D1B2A',
                                      textDecoration: 'none' }}>
            Start free →
          </a>
          <a href="/discover" style={{ padding: '0.875rem 2rem', borderRadius: 10, fontWeight: 700,
                                        fontSize: 16, border: '1px solid rgba(255,255,255,0.2)',
                                        color: '#F0F4F8', textDecoration: 'none' }}>
            Browse events
          </a>
        </div>
        <p style={{ marginTop: '1rem', fontSize: 13, color: '#64748B' }}>
          No credit card required · Unlimited events on every plan
        </p>
      </section>

      {/* Social proof */}
      <section style={{ background: '#1E3A5F22', borderTop: '1px solid rgba(255,255,255,0.06)',
                        borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '2rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', gap: '3rem',
                      justifyContent: 'center', flexWrap: 'wrap', textAlign: 'center' }}>
          {[
            { value: '17', label: 'AMS integrations' },
            { value: '$199/mo', label: 'flat pricing' },
            { value: '100%', label: 'offline check-in' },
            { value: '0%', label: 'ticket fees' },
          ].map(({ value, label }) => (
            <div key={label}>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#2DD4BF', margin: 0 }}>{value}</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: '4px 0 0' }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section style={{ padding: '4rem 2rem', maxWidth: 1000, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800,
                     margin: '0 0 3rem', letterSpacing: -0.5 }}>
          Everything your event needs
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} style={{ background: '#1E3A5F33', borderRadius: 12, padding: '1.5rem',
                                       border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
              <p style={{ fontWeight: 700, fontSize: 15, color: '#F0F4F8', margin: '0 0 6px' }}>{title}</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* vs competitors */}
      <section style={{ padding: '4rem 2rem', maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, margin: '0 0 2rem' }}>
          Why organizers switch to Prezva
        </h2>
        <div style={{ background: '#1E3A5F33', borderRadius: 16, overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#1E3A5F' }}>
                <th style={{ padding: '1rem', textAlign: 'left', color: '#94A3B8', fontWeight: 600 }}>Feature</th>
                <th style={{ padding: '1rem', textAlign: 'center', color: '#2DD4BF', fontWeight: 800 }}>Prezva</th>
                <th style={{ padding: '1rem', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>Whova</th>
                <th style={{ padding: '1rem', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>Eventbrite</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Flat monthly pricing', '✓ $199/mo', '✗ $3k-$10k/event', '✗ Per-ticket fees'],
                ['Offline check-in', '✓', '✗', '✗'],
                ['Direct bank payouts', '✓', '30-day delay', '✗'],
                ['AMS integrations', '✓ 17 systems', 'Limited', '✗'],
                ['Speaker portal', '✓ Full', 'Basic', '✗'],
                ['Volunteer management', '✓', '✗', '✗'],
                ['Sponsor lead scanning', '✓', '✓', '✗'],
              ].map(([feature, prezva, whova, eventbrite]) => (
                <tr key={feature} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '0.875rem 1rem', color: '#F0F4F8' }}>{feature}</td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#2DD4BF', fontWeight: 600 }}>{prezva}</td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#64748B' }}>{whova}</td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#64748B' }}>{eventbrite}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: '4rem 2rem', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {TESTIMONIALS.map(({ quote, author, role }) => (
            <div key={author} style={{ background: '#1E3A5F33', borderRadius: 12, padding: '1.5rem',
                                        border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: 14, color: '#F0F4F8', lineHeight: 1.6, margin: '0 0 1rem',
                           fontStyle: 'italic' }}>
                &ldquo;{quote}&rdquo;
              </p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#2DD4BF', margin: 0 }}>{author}</p>
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>{role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '5rem 2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 900, margin: '0 0 1rem',
                     letterSpacing: -0.5 }}>
          Ready to run a better event?
        </h2>
        <p style={{ fontSize: 16, color: '#94A3B8', margin: '0 0 2rem' }}>
          Get started free. No credit card required.
        </p>
        <a href="/signup" style={{ display: 'inline-block', padding: '1rem 2.5rem', borderRadius: 10,
                                    fontWeight: 800, fontSize: 18, background: '#2DD4BF', color: '#0D1B2A',
                                    textDecoration: 'none' }}>
          Create your free account →
        </a>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '2rem',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#2DD4BF' }}>Prezva</span>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {[['Discover Events', '/discover'], ['Sign in', '/login'], ['Privacy', '/privacy'], ['Terms', '/terms']].map(([label, href]) => (
            <a key={href} href={href} style={{ fontSize: 13, color: '#64748B', textDecoration: 'none' }}>
              {label}
            </a>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#334155' }}>© 2026 4S Logistics LLC</span>
      </footer>
    </div>
  )
}
