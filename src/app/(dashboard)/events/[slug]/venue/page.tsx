import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getVenueMaps, deleteVenueMap, updateVenueMapHotspots, createVenueMap } from '@/lib/agenda/sprint6-actions'

type Props = { params: Promise<{ slug: string }> }

export default async function VenuePage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) notFound()

  const maps = await getVenueMaps((event as any).id)

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--pz-label)' }}>
          <a href={`/events/${slug}`} style={{ color: 'var(--pz-muted)' }}>← {(event as any).title}</a>
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Venue maps</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Upload floor plan images and define hotspot regions.
        </p>
      </div>

      {/* Add map */}
      <div className="pz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--pz-text)' }}>Add venue map</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--pz-muted)' }}>
          Upload your map image to storage and paste the public URL below.
        </p>
        <form
          action={async (fd: FormData) => {
            'use server'
            await createVenueMap((event as any).id, {
              name: (fd.get('name') as string) || 'Venue Map',
              storage_path: fd.get('image_url') as string,
              hotspots: [],
            })
          }}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Map name</label>
            <input name="name" placeholder="Main Hall" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Image URL (public)</label>
            <input name="image_url" required placeholder="https://..." className={inputCls} style={inputStyle} />
          </div>
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Add map
          </button>
        </form>
      </div>

      {/* Map list */}
      {maps.length === 0 ? (
        <div className="pz-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No venue maps yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {maps.map((m: any) => (
            <div key={m.id} className="pz-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{m.name}</p>
                <form action={async () => { 'use server'; await deleteVenueMap(m.id) }}>
                  <button type="submit" className="text-xs hover:opacity-70" style={{ color: 'var(--pz-error)' }}>Remove</button>
                </form>
              </div>
              {m.storage_path && (
                <img
                  src={m.storage_path}
                  alt={m.name}
                  className="w-full rounded-lg mb-3"
                  style={{ maxHeight: 200, objectFit: 'contain', background: 'var(--pz-surface-2)' }}
                />
              )}
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--pz-label)' }}>Hotspots JSON</p>
              <p className="text-xs mb-1" style={{ color: 'var(--pz-muted)' }}>
                {'Format: [{"id":"room1","label":"Room A","x_pct":10,"y_pct":20,"w_pct":15,"h_pct":10}]'}
              </p>
              <form
                action={async (fd: FormData) => {
                  'use server'
                  try {
                    const hotspots = JSON.parse((fd.get('hotspots') as string) || '[]')
                    await updateVenueMapHotspots(m.id, hotspots)
                  } catch { /* invalid JSON — ignore */ }
                }}
                className="space-y-2"
              >
                <textarea
                  name="hotspots"
                  rows={4}
                  defaultValue={JSON.stringify(m.hotspots ?? [], null, 2)}
                  className={`${inputCls} font-mono text-xs`}
                  style={inputStyle}
                />
                <button
                  type="submit"
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                >
                  Save hotspots
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
