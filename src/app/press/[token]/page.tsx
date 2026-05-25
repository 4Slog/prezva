import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

type Props = { params: Promise<{ token: string }> }

export default async function PressPortalPage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: reg } = await admin
    .from('registrations')
    .select('id, attendee_name, attendee_email, event_id, events(id, title, slug, start_at, end_at, timezone, description, venue_name, venue_city)')
    .eq('press_token', token)
    .eq('status', 'confirmed')
    .single()

  if (!reg) notFound()
  const event = (reg as any).events

  const [sessionsRes, speakersRes] = await Promise.all([
    admin.from('sessions')
      .select('id, title, starts_at, ends_at, description, session_type, rooms(name), session_speakers(speakers(name, job_title, company, bio, photo_url))')
      .eq('event_id', (reg as any).event_id)
      .order('starts_at', { ascending: true }),
    admin.from('speakers')
      .select('id, name, job_title, company, bio, photo_url, event_role')
      .eq('event_id', (reg as any).event_id)
      .eq('status', 'confirmed')
      .order('sort_order', { ascending: true }),
  ])

  const sessions = sessionsRes.data ?? []
  const speakers = speakersRes.data ?? []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pz-teal)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Press Portal</span>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pz-text)', margin: '2px 0 0' }}>{event?.title}</h1>
          </div>
          <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>Credentialed: {(reg as any).attendee_name}</span>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1.5rem' }}>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Event Overview</h2>
          <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1rem 1.25rem', border: '1px solid var(--pz-border)' }}>
            {event?.description && <p style={{ fontSize: 14, color: 'var(--pz-text)', margin: '0 0 8px', lineHeight: 1.6 }}>{event.description}</p>}
            <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: 0 }}>
              {event?.start_at && new Date(event.start_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              {event?.venue_name && ` · ${event.venue_name}`}
              {event?.venue_city && `, ${event.venue_city}`}
            </p>
          </div>
        </section>

        {(speakers as any[]).length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Speakers ({(speakers as any[]).length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(speakers as any[]).map(s => (
                <div key={s.id} style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1rem 1.25rem', border: '1px solid var(--pz-border)', display: 'flex', gap: 12 }}>
                  {s.photo_url && (
                    <img src={s.photo_url} alt={s.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--pz-text)', margin: '0 0 2px' }}>{s.name}</p>
                    <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: '0 0 6px' }}>{s.job_title}{s.company ? `, ${s.company}` : ''}</p>
                    {s.bio && <p style={{ fontSize: 13, color: 'var(--pz-text)', margin: 0, lineHeight: 1.5 }}>{s.bio}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(sessions as any[]).length > 0 && (
          <section>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Schedule ({(sessions as any[]).length} sessions)
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(sessions as any[]).map(s => (
                <div key={s.id} style={{ background: 'var(--pz-surface)', borderRadius: 10, padding: '0.875rem 1rem', border: '1px solid var(--pz-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>{s.title}</p>
                    <span style={{ fontSize: 11, color: 'var(--pz-muted)', flexShrink: 0 }}>
                      {s.starts_at && new Date(s.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {s.rooms?.name && ` · ${s.rooms.name}`}
                    </span>
                  </div>
                  {s.description && <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>{s.description}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
