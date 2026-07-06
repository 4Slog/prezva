import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getSessionIdentity } from '@/lib/auth/session-identity'
import { checkRateLimit, myQrLimiter } from '@/lib/ratelimit'
import QRDisplay from './qr-display'
import Link from 'next/link'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ email?: string; pin?: string }>
}

type RegRow = {
  id: string
  attendee_name: string | null
  attendee_email: string | null
  qr_code: string | null
  pin: string | null
  status: string
}

const REG_COLS = 'id, attendee_name, attendee_email, qr_code, pin, status'

export default async function MyQRPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { email, pin } = await searchParams

  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'
  const { limited } = await checkRateLimit(myQrLimiter, ip)
  if (limited) return <div>Too many requests — try again in a minute.</div>

  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title')
    .eq('slug', slug)
    .maybeSingle()

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--pz-bg)' }}>
        <p style={{ color: 'var(--pz-muted)' }}>Event not found.</p>
      </div>
    )
  }

  // QR + PIN are check-in credentials. Returned only to a proven owner:
  //  (a) authenticated user owning a confirmed reg for this event (by user_id,
  //      or by their verified auth email if the reg isn't user_id-linked yet),
  //  (b) a claim-level registrant identified by the pz_reg_ cookie, or
  //  (c) anonymous requester supplying BOTH the reg email AND the PIN.
  // Email alone is never sufficient (was an IDOR).
  const identity = await getSessionIdentity(slug)
  let reg: RegRow | null = null

  if (identity.type === 'user') {
    const { data: byUid } = await admin
      .from('registrations')
      .select(REG_COLS)
      .eq('event_id', event.id)
      .eq('user_id', identity.userId)
      .eq('status', 'confirmed')
      .maybeSingle()
    reg = (byUid as RegRow | null) ?? null

    if (!reg) {
      const sessionClient = await createClient()
      const { data: { user } } = await sessionClient.auth.getUser()
      const userEmail = user?.email?.toLowerCase()
      if (userEmail) {
        const { data: byEmail } = await admin
          .from('registrations')
          .select(REG_COLS)
          .eq('event_id', event.id)
          .eq('attendee_email', userEmail)
          .eq('status', 'confirmed')
          .maybeSingle()
        reg = (byEmail as RegRow | null) ?? null
      }
    }
  } else if (identity.type === 'registration' && identity.eventId === event.id) {
    const { data } = await admin
      .from('registrations')
      .select(REG_COLS)
      .eq('id', identity.registrationId)
      .eq('status', 'confirmed')
      .maybeSingle()
    reg = (data as RegRow | null) ?? null
  } else if (email && pin) {
    const { data } = await admin
      .from('registrations')
      .select(REG_COLS)
      .eq('event_id', event.id)
      .eq('attendee_email', email.toLowerCase())
      .eq('status', 'confirmed')
      .maybeSingle()
    const candidate = data as RegRow | null
    if (candidate && candidate.pin && candidate.pin === pin) {
      reg = candidate
    }
  }

  const isIdentified = identity.type === 'user' || identity.type === 'registration'
  const anonAttempted = identity.type === 'anonymous' && !!email && !!pin

  return (
    <div className="min-h-screen flex items-center justify-center py-10 px-4" style={{ background: 'var(--pz-bg)' }}>
      <div className="mx-auto max-w-sm w-full">
        <div className="pz-card p-8 text-center">
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Your Check-In QR</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--pz-muted)' }}>{event.title}</p>

          {reg && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--pz-muted)' }}>
                Hi, <strong style={{ color: 'var(--pz-text)' }}>{reg.attendee_name}</strong>. Show this at check-in.
              </p>
              <QRDisplay qrCode={reg.qr_code ?? ''} />
              <p className="text-xs mt-4" style={{ color: 'var(--pz-muted)', wordBreak: 'break-all' }}>{reg.qr_code}</p>
              <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--pz-bg)', border: '1px solid var(--pz-border)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--pz-muted)' }}>Check-in PIN</p>
                <p className="text-2xl font-bold tracking-widest font-mono" style={{ color: 'var(--pz-text)' }}>{reg.pin}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--pz-muted)' }}>Use with your email if you don&apos;t have your QR code</p>
              </div>
            </div>
          )}

          {!reg && isIdentified && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--pz-muted)' }}>
                We couldn&apos;t find a confirmed registration on your account for this event.
              </p>
              <Link href={`/e/${slug}`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>Back to event</Link>
            </div>
          )}

          {!reg && identity.type === 'anonymous' && (
            <div>
              {anonAttempted && (
                <p className="text-sm mb-3" style={{ color: 'var(--pz-muted)' }}>
                  No matching registration found. Check your email and PIN, then try again.
                </p>
              )}
              <form method="GET">
                <p className="text-sm mb-3" style={{ color: 'var(--pz-muted)' }}>Enter your registration email and check-in PIN to retrieve your QR code.</p>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={email ?? ''}
                  placeholder="you@example.com"
                  className="w-full mb-3 px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
                />
                <input
                  name="pin"
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="Check-in PIN"
                  className="w-full mb-3 px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg font-semibold text-sm"
                  style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
                >
                  Get My QR
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
