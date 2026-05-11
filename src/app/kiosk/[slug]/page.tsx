import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KioskClient } from './kiosk-client'

type Props = { params: Promise<{ slug: string }> }

export default async function KioskPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, logo_url')
    .eq('slug', slug)
    .single()

  if (!event) notFound()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>{(event as any).title}</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>Welcome! Check in below.</p>
        </div>
        <KioskClient eventId={(event as any).id} />
      </div>
    </div>
  )
}
