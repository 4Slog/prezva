import { PortalShell } from '@/components/portal/PortalShell'

// Shown for a real speaker link past its window (D-R3) — distinct from an
// unknown token, which is a 404.
export function SpeakerLinkExpired({ eventName, speakerName }: { eventName: string; speakerName?: string }) {
  return (
    <PortalShell eventName={eventName} portalLabel="Speaker Portal" entityName={speakerName}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem' }}>
        <div className="pz-card p-8 text-center" style={{ maxWidth: 480 }}>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>
            This link has expired
          </h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            This link has expired — ask the organizer to resend it.
          </p>
        </div>
      </div>
    </PortalShell>
  )
}
