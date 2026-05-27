'use client'

const DEMO_MAILTO = 'mailto:hello@prezva.app?subject=Prezva%20Demo%20Request'

const FEATURES = [
  { title: 'Registration & Ticketing', desc: 'Free, paid, and member-only tickets with Stripe Connect — direct payouts to your bank.' },
  { title: 'Offline-First Check-in', desc: 'QR code scanning works without internet. Sync when back online. Never miss a check-in.' },
  { title: 'Speaker Portal', desc: 'Invite speakers, collect bios, share handouts, send reminders. All automated.' },
  { title: 'Volunteer Management', desc: 'Assign shifts, track hours, send thank-yous. Your team runs smoothly.' },
  { title: 'Sponsor Portal', desc: 'Lead scanning, ROI reports, booth editing. Sponsors love it.' },
  { title: 'Real-Time Analytics', desc: 'Registration pace, check-in velocity, revenue breakdown. Know your event is on track.' },
  { title: '17 AMS Integrations', desc: 'Wild Apricot, iMIS, MemberClicks, and more. Your member database, your rules.' },
  { title: 'Attendee Engagement', desc: 'Trivia, icebreakers, passport challenges, leaderboards. Events people remember.' },
]

const TESTIMONIALS = [
  { quote: 'We replaced Whova and saved $8,000 at our annual conference.', author: 'Sarah M.', role: 'Events Director', org: 'State Association, 500 members' },
  { quote: 'The offline check-in alone was worth switching. No more panic moments.', author: 'James T.', role: 'Association Manager', org: 'Regional Chapter' },
  { quote: 'Our speakers love the portal. Zero back-and-forth emails.', author: 'Priya K.', role: 'Conference Chair', org: 'Annual Conference, 300 attendees' },
]

const PLANS = [
  {
    name: 'Starter',
    monthly: '$149',
    annual: 'billed annually at $1,290/yr',
    blurb: 'Best for small associations, chapter events',
    features: [
      'Up to 200 attendees per event',
      'Unlimited events',
      'Registration & ticketing',
      'QR check-in (offline)',
      'Basic analytics',
      'Email support',
    ],
    cta: { label: 'Get started', href: '/signup' },
    popular: false,
  },
  {
    name: 'Pro',
    monthly: '$349',
    annual: 'billed annually at $2,988/yr',
    blurb: 'Best for mid-size associations, annual conferences',
    features: [
      'Up to 1,000 attendees per event',
      'Everything in Starter plus:',
      'Speaker & volunteer portals',
      'Sponsor management',
      'AI announcement drafting',
      'Surveys, trivia, icebreakers',
      'CE credits & certificates',
      '17 AMS integrations',
      'Priority support',
    ],
    cta: { label: 'Get started', href: '/signup' },
    popular: true,
  },
  {
    name: 'Scale',
    monthly: '$699',
    annual: 'billed annually at $5,988/yr',
    blurb: 'Best for large associations, multiple annual events',
    features: [
      'Unlimited attendees',
      'Everything in Pro plus:',
      'Custom branding',
      'Dedicated onboarding',
      'Quarterly business review',
      'SLA support',
    ],
    cta: { label: 'Contact us', href: DEMO_MAILTO },
    popular: false,
  },
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
          <a href="#pricing" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Pricing</a>
          <a href="/login" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Sign in</a>
          <a href={DEMO_MAILTO} style={{ fontSize: 14, fontWeight: 700, padding: '0.5rem 1.25rem',
                                      background: '#2DD4BF', color: '#0D1B2A', borderRadius: 8,
                                      textDecoration: 'none' }}>
            Book a demo
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
          in one platform. Starting at $149/month.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={DEMO_MAILTO} style={{ padding: '0.875rem 2rem', borderRadius: 10, fontWeight: 800,
                                      fontSize: 16, background: '#2DD4BF', color: '#0D1B2A',
                                      textDecoration: 'none' }}>
            Book a demo →
          </a>
          <a href="/discover" style={{ padding: '0.875rem 2rem', borderRadius: 10, fontWeight: 700,
                                        fontSize: 16, border: '1px solid rgba(255,255,255,0.2)',
                                        color: '#F0F4F8', textDecoration: 'none' }}>
            Browse events
          </a>
        </div>
        <p style={{ marginTop: '1rem', fontSize: 13, color: '#64748B' }}>
          No per-ticket fees · Direct bank payouts · Works offline
        </p>
      </section>

      {/* Stats bar */}
      <section style={{ background: '#1E3A5F22', borderTop: '1px solid rgba(255,255,255,0.06)',
                        borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '2rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', gap: '3rem',
                      justifyContent: 'center', flexWrap: 'wrap', textAlign: 'center' }}>
          {[
            { value: '17', label: 'AMS integrations' },
            { value: '$149/mo', label: 'starting price' },
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
          {FEATURES.map(({ title, desc }, i) => (
            <div key={title} style={{ background: '#1E3A5F33', borderRadius: 12, padding: '1.5rem',
                                       border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700,
                            color: '#2DD4BF', marginBottom: 12, letterSpacing: '0.05em' }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <p style={{ fontWeight: 700, fontSize: 15, color: '#F0F4F8', margin: '0 0 6px' }}>{title}</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why switch */}
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
                ['Flat monthly pricing', '✓ from $149/mo', '✗ $3k-$10k/event', '✗ Per-ticket fees'],
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
          {TESTIMONIALS.map(({ quote, author, role, org }) => (
            <div key={author} style={{ background: '#1E3A5F33', borderRadius: 12, padding: '1.5rem',
                                        border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: 14, color: '#F0F4F8', lineHeight: 1.6, margin: '0 0 1rem',
                           fontStyle: 'italic' }}>
                &ldquo;{quote}&rdquo;
              </p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#2DD4BF', margin: 0 }}>{author}</p>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>{role}</p>
              <p style={{ fontSize: 11, color: '#64748B', margin: '2px 0 0' }}>{org}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: '5rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 800,
                     margin: '0 0 0.75rem', letterSpacing: -0.5 }}>
          Simple, transparent pricing
        </h2>
        <p style={{ textAlign: 'center', fontSize: 16, color: '#94A3B8', margin: '0 0 3rem' }}>
          No per-ticket fees. No surprise charges. Cancel anytime.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 24 }}>
          {PLANS.map((plan) => (
            <div key={plan.name} style={{
              background: plan.popular ? '#1E3A5F55' : '#1E3A5F22',
              borderRadius: 16,
              padding: '2rem 1.5rem',
              border: plan.popular ? '1px solid #2DD4BF' : '1px solid rgba(255,255,255,0.08)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {plan.popular && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                              background: '#2DD4BF', color: '#0D1B2A', fontSize: 11, fontWeight: 800,
                              padding: '4px 12px', borderRadius: 12, textTransform: 'uppercase',
                              letterSpacing: '0.05em' }}>
                  Most Popular
                </div>
              )}
              <p style={{ fontSize: 14, fontWeight: 700, color: '#2DD4BF', margin: '0 0 0.5rem',
                          textTransform: 'uppercase', letterSpacing: '0.05em' }}>{plan.name}</p>
              <div style={{ marginBottom: '0.75rem' }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: '#F0F4F8' }}>{plan.monthly}</span>
                <span style={{ fontSize: 14, color: '#94A3B8', marginLeft: 6 }}>/month</span>
              </div>
              <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 0.5rem' }}>{plan.annual}</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 1.25rem' }}>{plan.blurb}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ fontSize: 13, color: '#CBD5E1', margin: '0 0 0.5rem',
                                       paddingLeft: 18, position: 'relative', lineHeight: 1.5 }}>
                    <span style={{ position: 'absolute', left: 0, color: '#2DD4BF' }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a href={plan.cta.href} style={{
                display: 'block', textAlign: 'center', padding: '0.75rem 1.5rem', borderRadius: 10,
                fontWeight: 800, fontSize: 14, textDecoration: 'none',
                background: plan.popular ? '#2DD4BF' : 'transparent',
                color: plan.popular ? '#0D1B2A' : '#F0F4F8',
                border: plan.popular ? 'none' : '1px solid rgba(255,255,255,0.2)',
              }}>
                {plan.cta.label}
              </a>
            </div>
          ))}
        </div>

        {/* One-time event banner */}
        <div style={{ background: '#0F2236', borderRadius: 16, padding: '1.5rem 2rem',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center',
                      justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 280px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#2DD4BF', margin: '0 0 0.25rem',
                        textTransform: 'uppercase', letterSpacing: '0.05em' }}>One-time event</p>
            <p style={{ fontSize: 15, color: '#F0F4F8', fontWeight: 600, margin: '0 0 0.25rem' }}>
              Hosting a single event? Skip the subscription.
            </p>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: '#F0F4F8' }}>Standard $799/event</strong> (up to 500 attendees) ·{' '}
              <strong style={{ color: '#F0F4F8' }}>Conference $1,199/event</strong> (up to 2,000 attendees) ·
              Full feature set, no subscription required.
            </p>
          </div>
          <a href={DEMO_MAILTO} style={{
            padding: '0.75rem 1.5rem', borderRadius: 10, fontWeight: 800, fontSize: 14,
            background: '#2DD4BF', color: '#0D1B2A', textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            Book a demo →
          </a>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#64748B', marginTop: '1.5rem' }}>
          Have a promo code? Enter it at checkout.
        </p>
      </section>

      {/* Final CTA */}
      <section style={{ padding: '5rem 2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 900, margin: '0 0 1rem',
                     letterSpacing: -0.5 }}>
          Ready to run a better event?
        </h2>
        <p style={{ fontSize: 16, color: '#94A3B8', margin: '0 0 2rem' }}>
          Join associations already running on Prezva.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={DEMO_MAILTO} style={{ display: 'inline-block', padding: '1rem 2.5rem', borderRadius: 10,
                                      fontWeight: 800, fontSize: 18, background: '#2DD4BF', color: '#0D1B2A',
                                      textDecoration: 'none' }}>
            Book a demo →
          </a>
          <a href="/discover" style={{ display: 'inline-block', padding: '1rem 2.5rem', borderRadius: 10,
                                        fontWeight: 700, fontSize: 16,
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: '#F0F4F8', textDecoration: 'none' }}>
            Or browse public events →
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '2rem',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#2DD4BF' }}>Prezva</span>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {[
            ['Discover Events', '/discover'],
            ['Pricing', '#pricing'],
            ['Sign in', '/login'],
            ['Privacy', '/privacy'],
            ['Terms', '/terms'],
          ].map(([label, href]) => (
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
