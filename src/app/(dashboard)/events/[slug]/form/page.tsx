import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getFormFields, createFormField, deleteFormField } from '@/lib/registration/sprint5-actions'

type Props = { params: Promise<{ slug: string }> }

const FIELD_TYPES = ['text', 'textarea', 'select', 'checkbox', 'radio', 'email', 'phone', 'date']

export default async function FormFieldsPage({ params }: Props) {
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

  const fields = await getFormFields((event as any).id)

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--pz-label)' }}>
          <a href={`/events/${slug}`} style={{ color: 'var(--pz-muted)' }}>← {(event as any).title}</a>
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Registration form fields</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Custom fields collected from attendees at registration.
        </p>
      </div>

      {/* Add field form */}
      <div className="pz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--pz-text)' }}>Add field</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            await createFormField((event as any).id, {
              field_key: fd.get('field_key') as string,
              label: fd.get('label') as string,
              field_type: fd.get('field_type') as string,
              is_required: fd.get('is_required') === 'on',
            })
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Label</label>
            <input name="label" required placeholder="e.g. Company name" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Key (internal)</label>
            <input name="field_key" required placeholder="e.g. company_name" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Type</label>
            <select name="field_type" className={inputCls} style={inputStyle}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--pz-muted)' }}>
              <input type="checkbox" name="is_required" className="rounded accent-[#00BFA6]" />
              Required
            </label>
          </div>
          <div className="col-span-2">
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              Add field
            </button>
          </div>
        </form>
      </div>

      {/* Field list */}
      {fields.length === 0 ? (
        <div className="pz-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            No custom fields yet. Standard fields (name, email) are always collected.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((f: any) => (
            <div key={f.id} className="pz-card flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{f.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
                  {f.field_type} · key: <code>{f.field_key}</code>
                  {f.is_required && ' · required'}
                </p>
              </div>
              <form action={async () => { 'use server'; await deleteFormField(f.id) }}>
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
