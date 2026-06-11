import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, myQrLimiter } from '@/lib/ratelimit'
import QRDisplay from './qr-display'
import Link from 'next/link'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ email?: string }>
}

export default async function MyQRPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { email } = await searchParams

  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'
  const { limited } = await checkRateLimit(myQrLimiter, ip)
  if (limited) return <div>Too many requests — try again in a minute.</div>

  const supabase = await createClient()

  // Fetch event
  const { data: event } = await supabase
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

  // Look up confirmed registration by email — use admin client so guests
  // who registered without an auth account can still retrieve their QR.
  // Strict status='confirmed' + event_id + email guard prevents enumeration.
  const admin = createAdminClient()
  void supabase
  const { data: reg } = email
    ? await admin
        .from('registrations')
        .select('id, attendee_name, attendee_email, qr_code, pin, status')
        .eq('event_id', event.id)
        .eq('attendee_email', email.toLowerCase())
        .eq('status', 'confirmed')
        .maybeSingle()
    : { data: null }

  return (
    <div className="min-h-screen flex items-center justify-center py-10 px-4" style={{ background: 'var(--pz-bg)' }}>
      <div className="mx-auto max-w-sm w-full">
        <div className="pz-card p-8 text-center">
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Your Check-In QR</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--pz-muted)' }}>{event.title}</p>

          {!email && (
            <form method="GET">
              <p className="text-sm mb-3" style={{ color: 'var(--pz-muted)' }}>Enter your registration email to retrieve your QR code.</p>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
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
          )}

          {email && !reg && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--pz-muted)' }}>
                No confirmed registration found for <strong style={{ color: 'var(--pz-text)' }}>{email}</strong>.
              </p>
              <Link href={`/e/${slug}/my-qr`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>Try another email</Link>
            </div>
          )}

          {reg && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--pz-muted)' }}>
                Hi, <strong style={{ color: 'var(--pz-text)' }}>{reg.attendee_name}</strong>. Show this at check-in.
              </p>
              <QRDisplay qrCode={reg.qr_code} />
              <p className="text-xs mt-4" style={{ color: 'var(--pz-muted)', wordBreak: 'break-all' }}>{reg.qr_code}</p>
              <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--pz-bg)', border: '1px solid var(--pz-border)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--pz-muted)' }}>Check-in PIN</p>
                <p className="text-2xl font-bold tracking-widest font-mono" style={{ color: 'var(--pz-text)' }}>{(reg as any).pin}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--pz-muted)' }}>Use with your email if you don&apos;t have your QR code</p>
              </div>
              <Link href={`/e/${slug}/my-qr`} className="block text-xs mt-3" style={{ color: 'var(--pz-muted)' }}>← Different email</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
