import { notFound, redirect } from 'next/navigation'
import { confirmSpeakerSlot } from '@/lib/speaker/speaker-actions'
import { resolveSpeakerLink } from '@/lib/speaker/speaker-link'
import { SpeakerLinkExpired } from '@/components/portal/SpeakerLinkExpired'
import { createClient } from '@/lib/supabase/server'
import { DeclineForm } from './decline-form'
import { PortalShell } from '@/components/portal/PortalShell'

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ failed?: string }> }

export default async function SpeakerConfirmPage({ params, searchParams }: Props) {
  const { token } = await params
  const { failed } = await searchParams
  const link = await resolveSpeakerLink(token)
  if (!link) notFound()
  if (link.expired) return <SpeakerLinkExpired eventName={link.event.title} speakerName={link.speaker.name} />
  const speaker = { ...link.speaker, events: { title: link.event.title, slug: link.event.slug } }

  const supabase = await createClient()
  const { data: sessions } = await supabase
    .from('session_speakers')
    .select('sessions(title, starts_at, ends_at, room_id, rooms(name))')
    .eq('speaker_id', speaker.id)

  const eventTitle = (speaker.events as any)?.title ?? ''

  if (speaker.status === 'confirmed' || speaker.status === 'declined') {
    return (
      <PortalShell
        eventName={eventTitle}
        portalLabel="Speaker Portal"
        entityName={speaker.name}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem' }}>
          <div className="pz-card p-8 text-center" style={{ maxWidth: 480 }}>
            <p className="text-2xl mb-2">{speaker.status === 'confirmed' ? '✅' : '❌'}</p>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>
              Already {speaker.status}
            </h1>
            <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
              Your slot has already been {speaker.status}. Contact the organizer if you need to change this.
            </p>
          </div>
        </div>
      </PortalShell>
    )
  }

  return (
    <PortalShell
      eventName={eventTitle}
      portalLabel="Speaker Portal"
      entityName={speaker.name}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem' }}>
        <div className="pz-card p-8 w-full" style={{ maxWidth: 560 }}>
          <p className="text-sm mb-1" style={{ color: 'var(--pz-muted)' }}>{eventTitle}</p>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Confirm your speaker slot</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--pz-muted)' }}>Hello {speaker.name} — please confirm or decline your invitation below.</p>

          {sessions && sessions.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>Your session(s)</p>
              <div className="space-y-2">
                {(sessions as any[]).map((ss, i) => (
                  <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--pz-surface-2)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{(ss.sessions as any)?.title}</p>
                    {(ss.sessions as any)?.starts_at && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
                        {new Date((ss.sessions as any).starts_at).toLocaleString()}
                        {(ss.sessions as any)?.rooms?.name && ` · ${(ss.sessions as any).rooms.name}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {failed && (
            <p className="text-sm mb-4" role="alert" style={{ color: 'var(--pz-error)' }}>
              We couldn&apos;t record your confirmation. Please try again or contact the organizer.
            </p>
          )}

          <div className="flex gap-3">
            <form action={async () => {
              'use server'
              const res = await confirmSpeakerSlot(token, 'confirmed')
              redirect(`/speaker/confirm/${encodeURIComponent(token)}${'error' in res ? '?failed=1' : ''}`)
            }}>
              <button
                type="submit"
                className="rounded-lg px-6 py-2.5 text-sm font-semibold"
                style={{ background: 'var(--pz-success)', color: 'var(--pz-surface)' }}
              >
                Confirm slot
              </button>
            </form>
            <DeclineForm token={token} />
          </div>
        </div>
      </div>
    </PortalShell>
  )
}
