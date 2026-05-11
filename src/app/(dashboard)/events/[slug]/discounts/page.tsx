import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { bulkImportDiscountCodes, exportDiscountCodes } from '@/lib/registration/sprint5-actions'

type Props = { params: Promise<{ slug: string }> }

export default async function DiscountsPage({ params }: Props) {
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

  const { data: codes } = await supabase
    .from('discount_codes')
    .select('id, code, discount_type, discount_value, max_uses, uses_count, is_active, valid_from, valid_until')
    .eq('event_id', (event as any).id)
    .order('created_at', { ascending: false })

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  function fmtDiscount(type: string, value: number) {
    return type === 'percent' ? `${value}% off` : `$${(value / 100).toFixed(2)} off`
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--pz-label)' }}>
          <a href={`/events/${slug}`} style={{ color: 'var(--pz-muted)' }}>← {(event as any).title}</a>
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Discount codes</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Bulk import via CSV or export existing codes.
        </p>
      </div>

      {/* Single code create */}
      <div className="pz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--pz-text)' }}>Add code</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            const csv = [
              'code,type,value,max_uses',
              [
                fd.get('code'),
                fd.get('discount_type'),
                fd.get('discount_value'),
                fd.get('max_uses') || '',
              ].join(','),
            ].join('\n')
            await bulkImportDiscountCodes((event as any).id, csv)
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Code</label>
            <input name="code" required placeholder="SUMMER25" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Type</label>
            <select name="discount_type" className={inputCls} style={inputStyle}>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed ($)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Value (% or cents)</label>
            <input name="discount_value" type="number" min="1" required className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Max uses (blank = unlimited)</label>
            <input name="max_uses" type="number" min="1" className={inputCls} style={inputStyle} />
          </div>
          <div className="col-span-2">
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              Add code
            </button>
          </div>
        </form>
      </div>

      {/* Bulk CSV import */}
      <div className="pz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--pz-text)' }}>Bulk import</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--pz-muted)' }}>
          CSV format: <code>code,type,value,max_uses</code> — type is <code>percent</code> or <code>fixed</code>.
          Value is % for percent, cents for fixed. max_uses is optional.
        </p>
        <form
          action={async (fd: FormData) => {
            'use server'
            const csv = fd.get('csv') as string
            if (csv?.trim()) await bulkImportDiscountCodes((event as any).id, csv)
          }}
          className="space-y-3"
        >
          <textarea
            name="csv"
            rows={6}
            placeholder={'code,type,value,max_uses\nSUMMER25,percent,25,100\nFLAT10,fixed,1000,'}
            className={`${inputCls} font-mono text-xs`}
            style={inputStyle}
          />
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Import
          </button>
        </form>
      </div>

      {/* Export */}
      <div className="pz-card p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>Export all codes</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
              Download a CSV of all discount codes for this event.
            </p>
          </div>
          <form
            action={async () => {
              'use server'
              await exportDiscountCodes((event as any).id)
            }}
          >
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
            >
              Export CSV
            </button>
          </form>
        </div>
      </div>

      {/* Code list */}
      {!codes || codes.length === 0 ? (
        <div className="pz-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No discount codes yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {codes.map((c: any) => (
            <div key={c.id} className="pz-card flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-mono font-medium" style={{ color: 'var(--pz-text)' }}>{c.code}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
                  {fmtDiscount(c.discount_type, c.discount_value)}
                  {' · '}
                  {c.uses_count} / {c.max_uses ?? '∞'} uses
                  {!c.is_active && ' · inactive'}
                </p>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  background: c.is_active ? 'rgba(0,191,166,0.15)' : 'var(--pz-surface-2)',
                  color: c.is_active ? 'var(--pz-teal)' : 'var(--pz-label)',
                }}
              >
                {c.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
