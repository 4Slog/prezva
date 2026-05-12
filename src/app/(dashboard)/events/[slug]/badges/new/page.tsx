import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function NewBadgeTemplatePage({ params }: Props) {
  const { slug } = await params
  await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <Link
          href={`/events/${slug}/badges`}
          className="text-sm hover:underline"
          style={{ color: 'var(--pz-teal)' }}
        >
          ← Back to Badge templates
        </Link>
      </div>

      <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>
        New badge template
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--pz-text-muted)' }}>
        {(event as any).title}
      </p>

      <div
        className="rounded-xl p-8 text-center"
        style={{ border: '2px dashed var(--pz-border)', background: 'var(--pz-surface)' }}
      >
        <div className="text-4xl mb-4">🎫</div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--pz-text)' }}>
          Badge designer coming in Sprint 20
        </h2>
        <p className="text-sm" style={{ color: 'var(--pz-text-muted)' }}>
          The full badge designer (drag-and-drop layout, QR codes, photos) ships with the template library in Sprint 20.
          For now, you can use the default templates from the Badges page.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href={`/events/${slug}/badges`}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
          >
            ← Back
          </Link>
        </div>
      </div>
    </div>
  )
}
