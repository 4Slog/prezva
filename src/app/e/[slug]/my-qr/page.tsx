import { createClient } from '@/lib/supabase/server'
import QRDisplay from './qr-display'
import Link from 'next/link'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ email?: string }>
}

export default async function MyQRPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { email } = await searchParams

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
        <p style={{ color: 'var(--pz-text-muted)' }}>Event not found.</p>
      </div>
    )
  }

  // Look up confirmed registration by email
  const { data: reg } = email
    ? await supabase
        .from('registrations')
        .select('id, attendee_name, attendee_email, qr_code, status')
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
          <p className="text-sm mb-6" style={{ color: 'var(--pz-text-muted)' }}>{event.title}</p>

          {!email && (
            <form method="GET">
              <p className="text-sm mb-3" style={{ color: 'var(--pz-text-muted)' }}>Enter your registration email to retrieve your QR code.</p>
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
                style={{ background: 'var(--pz-teal)', color: '#fff' }}
              >
                Get My QR
              </button>
            </form>
          )}

          {email && !reg && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--pz-text-muted)' }}>
                No confirmed registration found for <strong style={{ color: 'var(--pz-text)' }}>{email}</strong>.
              </p>
              <Link href={`/e/${slug}/my-qr`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>Try another email</Link>
            </div>
          )}

          {reg && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--pz-text-muted)' }}>
                Hi, <strong style={{ color: 'var(--pz-text)' }}>{reg.attendee_name}</strong>. Show this at check-in.
              </p>
              <QRDisplay qrCode={reg.qr_code} />
              <p className="text-xs mt-4" style={{ color: 'var(--pz-text-muted)', wordBreak: 'break-all' }}>{reg.qr_code}</p>
              <Link href={`/e/${slug}/my-qr`} className="block text-xs mt-3" style={{ color: 'var(--pz-text-muted)' }}>← Different email</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
