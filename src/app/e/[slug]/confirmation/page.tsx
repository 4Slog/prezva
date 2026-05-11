import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ConfirmationQR } from './qr-wrapper'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ reg?: string; waitlist?: string }>
}

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { reg: regId, waitlist } = await searchParams

  const supabase = await createClient()
  const { data: reg } = regId
    ? await supabase
        .from('registrations')
        .select('*, ticket_types(name, price_cents), events(title, start_at, timezone)')
        .eq('id', regId)
        .maybeSingle()
    : { data: null }

  const isWaitlist = waitlist === 'true'

  return (
    <div className="min-h-screen flex items-center justify-center py-10 px-4" style={{ background: 'var(--pz-bg)' }}>
      <div className="mx-auto max-w-md w-full">
        <div className="pz-card p-8 text-center">
          {isWaitlist ? (
            <>
              <div className="text-4xl mb-4">⏳</div>
              <h1 className="text-xl font-bold text-[#F0F4F8] mb-2">You&apos;re on the waitlist</h1>
              <p className="text-sm text-[#94A3B8] mb-2">
                Position #{reg?.waitlist_position ?? '—'}
              </p>
              <p className="text-sm text-[#94A3B8]">
                We&apos;ll email you at <strong className="text-[#F0F4F8]">{reg?.attendee_email}</strong> if a spot opens up.
              </p>
            </>
          ) : (
            <>
              <div className="text-4xl mb-4">✅</div>
              <h1 className="text-xl font-bold text-[#F0F4F8] mb-2">You&apos;re registered!</h1>
              {reg && (
                <>
                  <p className="text-sm text-[#94A3B8] mb-1">
                    {(reg.events as { title: string } | null)?.title}
                  </p>
                  <p className="text-sm text-[#94A3B8] mb-6">
                    A confirmation has been emailed to{' '}
                    <strong className="text-[#F0F4F8]">{reg.attendee_email}</strong>
                  </p>
                  <ConfirmationQR qrCode={reg.qr_code} />
                </>
              )}
              <Link
                href={`/e/${slug}`}
                className="inline-block rounded-lg px-6 py-2 text-sm font-semibold mb-4"
                style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
              >
                View event details
              </Link>

              {reg && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--pz-border)' }}>
                  <p className="text-xs mb-3" style={{ color: 'var(--pz-label)' }}>Share your registration</p>
                  <div className="flex justify-center gap-3">
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I'm attending ${(reg.events as { title: string } | null)?.title ?? 'this event'}! Register at`)}&url=${encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL}/e/${slug}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
                    >
                      𝕏 Share
                    </a>
                    <a
                      href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL}/e/${slug}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
                    >
                      LinkedIn
                    </a>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <p className="text-center text-xs text-[#64748B] mt-4">
          Powered by Prezva
        </p>
      </div>
    </div>
  )
}
