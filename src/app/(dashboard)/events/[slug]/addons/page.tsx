import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getEventAddOns, createAddOn, deleteAddOn } from '@/lib/registration/sprint5-actions'

type Props = { params: Promise<{ slug: string }> }

export default async function AddOnsPage({ params }: Props) {
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

  const addOns = await getEventAddOns((event as any).id)

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  function fmtPrice(cents: number) {
    if (cents === 0) return 'Free'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--pz-label)' }}>
          <a href={`/events/${slug}`} style={{ color: 'var(--pz-muted)' }}>← {(event as any).title}</a>
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Add-ons</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Optional extras attendees can purchase (merch, sessions, amenities).
        </p>
      </div>

      <div className="pz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--pz-text)' }}>Create add-on</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            const priceDollars = parseFloat(fd.get('price_dollars') as string || '0')
            await createAddOn((event as any).id, {
              name: fd.get('name') as string,
              description: fd.get('description') as string || undefined,
              price_cents: Math.round(priceDollars * 100),
            })
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Name</label>
              <input name="name" required placeholder="e.g. Conference T-Shirt" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Description</label>
              <input name="description" placeholder="Optional" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Price (USD)</label>
              <input name="price_dollars" type="number" min="0" step="0.01" defaultValue="0" className={inputCls} style={inputStyle} />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Add
          </button>
        </form>
      </div>

      {addOns.length === 0 ? (
        <div className="pz-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No add-ons yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {addOns.map((ao: any) => (
            <div key={ao.id} className="pz-card flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{ao.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
                  {fmtPrice(ao.price_cents)}
                  {ao.description && ` · ${ao.description}`}
                  {ao.quantity && ` · ${ao.quantity - ao.quantity_sold} remaining`}
                </p>
              </div>
              <form action={async () => { 'use server'; await deleteAddOn(ao.id) }}>
                <button type="submit" className="text-xs hover:opacity-70" style={{ color: 'var(--pz-error)' }}>
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
