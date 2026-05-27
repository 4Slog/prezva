import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import QRDisplay from '@/app/e/[slug]/my-qr/qr-display'
import { cookies } from 'next/headers'
import CancelRegistrationButton from '@/components/registration/cancel-button'
import TransferButton from './transfer-button'
import { SocialShareButtons } from '@/components/events/SocialShareButtons'

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
  const supabase = await createClient()

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
        .select('*, ticket_types(name, price_cents), events(id, org_id, title, start_at, timezone, certificate_enabled, venue_name, venue_city, venue_state)')
        .eq('id', resolvedRegId)
        .maybeSingle()
    : { data: null }

  function fmtEventDate(iso: string | undefined, tz: string | undefined) {
    if (!iso) return null
    return new Date(iso).toLocaleString('en-US', {
      timeZone: tz || 'UTC',
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }

  const isWaitlist = waitlist === 'true'

  // Store reg token in cookie so getSessionIdentity() can use it server-side.
  // Cookie writes from Server Components throw in Next.js 16 — wrap in try/catch
  // so the page still renders if this code path is hit outside a Server Action.
  if (resolvedRegId && reg && !isWaitlist) {
    try {
      const jar = await cookies()
      jar.set(`pz_reg_${slug}`, resolvedRegId, {
        path: `/e/${slug}`,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 90, // 90 days
      })
    } catch {
      // Cookie set isn't supported in this render context — non-fatal.
    }
  }

  // Repeat attendee recognition
  let previousCount = 0
  let isGuest = false
  if (reg && !isWaitlist) {
    const { data: { user } } = await supabase.auth.getUser()
    // Guest = registration has no linked account
    isGuest = !reg.user_id && !user
    const orgId = (reg.events as any)?.org_id
    const eventId = (reg.events as any)?.id
    if (user && orgId && eventId) {
      const { count } = await admin
        .from('registrations')
        .select('id, events!inner(org_id)', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('events.org_id', orgId)
        .eq('status', 'confirmed')
        .neq('event_id', eventId)
      previousCount = count ?? 0
    }
  }

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
                  <p className="text-base font-semibold text-[#F0F4F8] mb-1">
                    {(reg.events as { title: string } | null)?.title}
                  </p>
                  {(() => {
                    const ev = reg.events as { start_at?: string; timezone?: string } | null
                    const when = fmtEventDate(ev?.start_at, ev?.timezone)
                    return when ? <p className="text-xs text-[#94A3B8] mb-1">{when}</p> : null
                  })()}
                  {(reg.ticket_types as { name: string } | null)?.name && (
                    <p className="text-xs text-[#64748B] mb-3">
                      {(reg.ticket_types as { name: string }).name}
                      {reg.attendee_name ? ` — ${reg.attendee_name}` : ''}
                    </p>
                  )}
                  <p className="text-sm text-[#94A3B8] mb-6">
                    A confirmation with your QR code has been emailed to{' '}
                    <strong className="text-[#F0F4F8]">{reg.attendee_email}</strong>
                  </p>
                  <div className="mb-6">
                    <QRDisplay qrCode={reg.qr_code} />
                    <p className="text-xs text-[#64748B] mt-2">Show this at check-in</p>
                  </div>
                  <a
                    href={`/api/registrations/${reg.id}/calendar.ics`}
                    className="text-sm mb-2"
                    style={{ color: 'var(--pz-teal)' }}
                  >
                    Add to Calendar
                  </a>
                </>
              )}
              {previousCount > 0 && (
                <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', background: 'var(--pz-teal, #00BFA6)15', borderRadius: 10, border: '1px solid rgba(0,191,166,0.27)', textAlign: 'center' }}>
                  <p style={{ fontSize: 14, color: 'var(--pz-teal, #00BFA6)', fontWeight: 600, margin: 0 }}>
                    Welcome back! 👋
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--pz-muted, #94A3B8)', margin: '4px 0 0' }}>
                    You&apos;ve attended {previousCount} previous event{previousCount !== 1 ? 's' : ''} with this organization.
                  </p>
                </div>
              )}
              {reg && (
                <SocialShareButtons
                  eventTitle={(reg.events as any)?.title ?? ''}
                  eventUrl={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'}/e/${slug}`}
                />
              )}
              {isGuest && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(45,212,191,0.08)', borderRadius: 10, border: '1px solid rgba(45,212,191,0.25)', textAlign: 'left' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#F0F4F8', margin: '0 0 4px' }}>💡 Save your registration</p>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 10px' }}>
                    Create a free Prezva account to manage your tickets, track your event history, and get personalized recommendations.
                  </p>
                  <Link
                    href="/signup"
                    className="inline-block rounded-lg px-4 py-1.5 text-xs font-semibold"
                    style={{ background: 'var(--pz-teal, #2DD4BF)', color: '#0D1B2A' }}
                  >
                    Create free account →
                  </Link>
                </div>
              )}
              <div className="flex flex-col gap-3 items-center">
                <Link
                  href={`/e/${slug}`}
                  className="inline-block rounded-lg px-6 py-2 text-sm font-semibold"
                  style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                >
                  View event details
                </Link>
                {reg && ['confirmed', 'waitlisted'].includes(reg.status) &&
                  (reg.events as any)?.start_at &&
                  new Date((reg.events as any).start_at) > new Date() && (
                  <CancelRegistrationButton
                    registrationId={reg.id}
                    eventTitle={(reg.events as any)?.title ?? ''}
                    isPaid={(reg.amount_paid_cents ?? 0) > 0}
                  />
                )}
                {reg && reg.status === 'confirmed' &&
                  (reg.events as any)?.start_at &&
                  new Date((reg.events as any).start_at) > new Date() && (
                  <TransferButton
                    registrationId={reg.id}
                    eventTitle={(reg.events as any)?.title ?? ''}
                  />
                )}
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
