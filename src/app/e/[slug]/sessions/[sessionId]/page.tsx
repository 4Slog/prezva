import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicSession } from '@/lib/public/actions'
import { getSessionIdentity } from '@/lib/auth/session-identity'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function SessionDetailPage({ params }: { params: Promise<{ slug: string; sessionId: string }> }) {
  const { slug, sessionId } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const session = await getPublicSession((event as any).id, sessionId)
  if (!session) notFound()

  const identity = await getSessionIdentity(slug)
  const registered =
    identity.type === 'user' ||
    (identity.type === 'registration' && identity.eventId === (event as any).id)
  let handouts: any[] = []
  if (registered) {
    const admin = createAdminClient()
    const { data: handoutsRaw } = await admin
      .from('session_handouts')
      .select('id, session_id, filename, storage_path')
      .eq('session_id', sessionId)
    handouts = (handoutsRaw ?? []) as any[]
  }

  const tz = (event as any).timezone ?? 'UTC'
  const s = session as any

  const timeStr =
    new Date(s.starts_at).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) +
    ' – ' +
    new Date(s.ends_at).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })

  const speakers = (s.session_speakers ?? [])
    .filter((ss: any) => ss.speakers)
    .map((ss: any) => ({ ...ss.speakers, role: ss.role ?? 'presenter' }))

  let watchHref: string | null = null
  let watchLabel = 'Watch'
  if (s.mux_stream_id) {
    watchHref = `/e/${slug}/sessions/${sessionId}/live`
    watchLabel = 'Watch Live'
  } else if (s.allow_rewatch && s.mux_asset_playback_id) {
    watchHref = `/e/${slug}/sessions/${sessionId}/live`
    watchLabel = 'Watch Recording'
  } else if (s.recording_url) {
    watchHref = s.recording_url
    watchLabel = 'Watch'
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Link href={'/e/' + slug + '/agenda'} style={{ color: 'var(--pz-teal-ink)', textDecoration: 'none', fontSize: 13 }}>← Back to agenda</Link>
          <div style={{ marginTop: '1rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pz-text)' }}>{s.title}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--pz-muted)' }}>{timeStr}</span>
              {s.tracks && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: (s.tracks.color ?? '#64748b') + '22', color: s.tracks.color ?? '#64748b', textTransform: 'uppercase' }}>
                  {s.tracks.name}
                </span>
              )}
              {s.rooms && (
                <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>{s.rooms.name}</span>
              )}
              {s.session_type && (
                <span style={{ fontSize: 11, color: 'var(--pz-muted)', textTransform: 'uppercase' }}>{s.session_type}</span>
              )}
              {s.ce_credit_hours > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)' }}>
                  {s.ce_credit_hours} CE {s.ce_credit_hours === 1 ? 'hour' : 'hours'}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: '1rem', flexWrap: 'wrap' }}>
            {watchHref && (
              <a
                href={watchHref}
                style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', textDecoration: 'none' }}
              >
                {watchLabel}
              </a>
            )}
            <Link
              href={'/e/' + slug + '/agenda'}
              style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--pz-border)', color: 'var(--pz-teal-ink)', textDecoration: 'none', background: 'var(--pz-surface)' }}
            >
              Add to my schedule
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1.5rem' }}>
        {s.description && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--pz-text)' }}>About this session</h2>
            <p style={{ lineHeight: 1.8, color: 'var(--pz-text)' }}>{s.description}</p>
          </section>
        )}

        {speakers.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--pz-text)' }}>Speakers</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {speakers.map((sp: any) => (
                <Link
                  key={sp.id}
                  href={'/e/' + slug + '/speakers/' + sp.id}
                  style={{ display: 'flex', gap: '1rem', alignItems: 'center', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '0.875rem 1rem', background: 'var(--pz-surface)', textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--pz-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--pz-teal-ink)', fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}>
                    {sp.photo_url
                      ? <img src={sp.photo_url} alt={sp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : sp.name.charAt(0)}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--pz-text)' }}>{sp.name}</p>
                    {(sp.job_title || sp.company) && (
                      <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>
                        {sp.job_title}{sp.job_title && sp.company ? ' · ' : ''}{sp.company}
                      </p>
                    )}
                    {sp.role !== 'presenter' && (
                      <p style={{ fontSize: 11, color: 'var(--pz-teal-ink)', textTransform: 'capitalize', marginTop: 2 }}>{sp.role}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {s.sponsored_by && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--pz-text)' }}>Sponsored by</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--pz-border)', borderRadius: 10, padding: '0.875rem 1rem', background: 'var(--pz-surface)' }}>
              {s.sponsored_by.logo_url && (
                <img src={s.sponsored_by.logo_url} alt={s.sponsored_by.name} style={{ height: 40, objectFit: 'contain' }} />
              )}
              {s.sponsored_by.website_url
                ? <a href={s.sponsored_by.website_url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: 'var(--pz-teal-ink)', textDecoration: 'none' }}>{s.sponsored_by.name}</a>
                : <span style={{ fontWeight: 600, color: 'var(--pz-text)' }}>{s.sponsored_by.name}</span>}
            </div>
          </section>
        )}

        {handouts.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--pz-text)' }}>Handouts</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {handouts.map((h: any) => (
                <a
                  key={h.id}
                  href={`/api/speaker/handouts/${h.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 13, color: 'var(--pz-teal-ink)', textDecoration: 'none', background: 'var(--pz-teal-bg)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--pz-teal)' }}
                >
                  {h.filename}
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
