import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicSponsors } from '@/lib/public/actions'

export default async function PublicSponsorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()

  const sponsors = await getPublicSponsors(event.id)

  const tierLabel: Record<string, string> = {
    title: 'Title Sponsor',
    gold: 'Gold',
    silver: 'Silver',
    bronze: 'Bronze',
    community: 'Community Partner',
    media: 'Media Partner',
  }
  const tierSize: Record<string, number> = {
    title: 140, gold: 100, silver: 75, bronze: 58, community: 58, media: 58,
  }
  const tierOrder = ['title', 'gold', 'silver', 'bronze', 'community', 'media']

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', color: 'var(--pz-text)' }}>
      {/* Header */}
      <header style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: 'var(--pz-teal-ink)', textDecoration: 'none', letterSpacing: -0.5 }}>P Prezva</Link>
        <Link href="/login" style={{ fontSize: 13, color: 'var(--pz-muted)', textDecoration: 'none' }}>Sign in</Link>
      </header>

      {/* Event hero strip */}
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link href={`/e/${slug}`} style={{ color: 'var(--pz-teal-ink)', textDecoration: 'none', fontSize: 13 }}>
            ← {event.title}
          </Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 8, color: 'var(--pz-text)' }}>Sponsors</h1>
          <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginTop: 4 }}>
            Thank you to our sponsors for making {event.title} possible.
          </p>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ borderBottom: '1px solid var(--pz-border)', marginBottom: '2rem', display: 'flex', gap: '2rem' }}>
          {[
            { label: 'Overview', href: `/e/${slug}` },
            { label: 'Agenda',   href: `/e/${slug}/agenda` },
            { label: 'Speakers', href: `/e/${slug}/speakers` },
            { label: 'Sponsors', href: `/e/${slug}/sponsors` },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              style={{
                padding: '1rem 0',
                color: href === `/e/${slug}/sponsors` ? 'var(--pz-teal-ink)' : 'var(--pz-text)',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: href === `/e/${slug}/sponsors` ? 600 : 500,
                borderBottom: href === `/e/${slug}/sponsors` ? '2px solid var(--pz-teal)' : '2px solid transparent',
              }}
            >
              {label}
            </Link>
          ))}
        </div>

        {sponsors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--pz-muted)' }}>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No sponsors listed yet</p>
            <p style={{ fontSize: 14 }}>Check back closer to the event date.</p>
          </div>
        ) : (
          <div style={{ paddingBottom: '3rem' }}>
            {tierOrder.map((tier) => {
              const group = sponsors.filter((s: any) => s.tier === tier)
              if (group.length === 0) return null
              const size = tierSize[tier] ?? 58
              return (
                <section key={tier} style={{ marginBottom: '2.5rem' }}>
                  <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--pz-muted)', marginBottom: 16 }}>
                    {tierLabel[tier] ?? tier}
                  </h2>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
                    {group.map((sp: any) => (
                      <a
                        key={sp.id}
                        href={sp.website_url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: size * 1.8, height: size,
                          border: '1px solid var(--pz-border)', borderRadius: 12,
                          background: 'var(--pz-surface)', padding: '0.75rem 1rem',
                          textDecoration: 'none', overflow: 'hidden',
                          transition: 'border-color 150ms',
                        }}
                      >
                        {sp.logo_url
                          ? <img src={sp.logo_url} alt={sp.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          : <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', textAlign: 'center' }}>{sp.name}</span>
                        }
                      </a>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
