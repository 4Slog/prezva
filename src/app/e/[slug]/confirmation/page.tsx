import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ reg?: string; waitlist?: string }>
}

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { reg: regId, waitlist } = await searchParams

  // Use admin client so guest registrations (user_id is null) can still
  // display their confirmation page. Reg ID is an unguessable UUID and is the
  // de-facto bearer token here, mirroring Eventbrite/Whova confirmation links.
  const admin = createAdminClient()
  void createClient
  const { data: reg } = regId
    ? await admin
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
                    A confirmation with your QR code has been emailed to{' '}
                    <strong className="text-[#F0F4F8]">{reg.attendee_email}</strong>
                  </p>
                  <div
                    className="rounded-lg p-4 mb-6 font-mono text-sm text-center"
                    style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}
                  >
                    <p className="text-xs text-[#64748B] mb-1">Your QR code ID</p>
                    <p className="text-[#00BFA6] tracking-wider">{reg.qr_code}</p>
                  </div>
                </>
              )}
              <div className="flex flex-col gap-3 items-center">
                <Link
                  href={`/e/${slug}`}
                  className="inline-block rounded-lg px-6 py-2 text-sm font-semibold"
                  style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                >
                  View event details
                </Link>
                {reg && (reg as any).certificate_token && (
                  <a
                    href={`/api/certificates/${reg.id}?token=${(reg as any).certificate_token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm"
                    style={{ color: 'var(--pz-teal)' }}
                  >
                    Download certificate (PDF)
                  </a>
                )}
                {reg && (
                  <div className="flex gap-2 justify-center flex-wrap mt-1">
                    <a
                      href={`/api/passes/apple/${reg.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E3A5F] px-3 py-1.5 text-xs text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6] transition-colors"
                    >
                      Add to Apple Wallet
                    </a>
                    <a
                      href={`/api/passes/google/${reg.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E3A5F] px-3 py-1.5 text-xs text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6] transition-colors"
                    >
                      Add to Google Wallet
                    </a>
                  </div>
                )}
              </div>
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
