import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import QRDisplay from '@/app/e/[slug]/my-qr/qr-display'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ reg?: string; session_id?: string; waitlist?: string }>
}

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { reg: regId, session_id, waitlist } = await searchParams

  const showAppleWallet = !!(
    process.env.APPLE_PASS_TEAM_ID &&
    process.env.APPLE_PASS_TYPE_IDENTIFIER &&
    process.env.APPLE_PASS_CERT &&
    process.env.APPLE_PASS_KEY &&
    process.env.APPLE_PASS_WWDR
  )
  const showGoogleWallet = !!(
    process.env.GOOGLE_WALLET_ISSUER_ID &&
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY
  )

  // Use admin client so guest registrations (user_id is null) can still
  // display their confirmation page. Reg ID is an unguessable UUID and is the
  // de-facto bearer token here, mirroring Eventbrite/Whova confirmation links.
  const admin = createAdminClient()
  void createClient

  let resolvedRegId = regId

  // Paid checkout: Stripe redirects with ?session_id= instead of ?reg=
  // Look up the registration by stripe_session_id matching the Stripe session
  if (!resolvedRegId && session_id) {
    const { data: stripeReg } = await admin
      .from('registrations')
      .select('id')
      .eq('stripe_session_id', session_id)
      .maybeSingle()
    resolvedRegId = stripeReg?.id ?? undefined
  }

  const { data: reg } = resolvedRegId
    ? await admin
        .from('registrations')
        .select('*, ticket_types(name, price_cents), events(title, start_at, timezone, certificate_enabled)')
        .eq('id', resolvedRegId)
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
                  <div className="mb-6">
                    <QRDisplay qrCode={reg.qr_code} />
                    <p className="text-xs text-[#64748B] mt-2">Show this at check-in</p>
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
                {reg && (reg.events as any)?.certificate_enabled && (
                  <Link
                    href={`/e/${slug}/certificate`}
                    className="text-sm"
                    style={{ color: 'var(--pz-teal)' }}
                  >
                    🎓 View certificate of attendance
                  </Link>
                )}
                {reg && (showAppleWallet || showGoogleWallet) && (
                  <div className="flex gap-2 justify-center flex-wrap mt-1">
                    {showAppleWallet && (
                      <a
                        href={`/api/passes/apple/${reg.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E3A5F] px-3 py-1.5 text-xs text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6] transition-colors"
                      >
                        Add to Apple Wallet
                      </a>
                    )}
                    {showGoogleWallet && (
                      <a
                        href={`/api/passes/google/${reg.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E3A5F] px-3 py-1.5 text-xs text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6] transition-colors"
                      >
                        Add to Google Wallet
                      </a>
                    )}
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
