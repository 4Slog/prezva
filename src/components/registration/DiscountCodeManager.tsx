'use client'

import { useState } from 'react'
import { createDiscountCode, toggleDiscountCode, deleteDiscountCode } from '@/lib/events/discount-actions'
import { Field } from '@/components/ui/Field'

interface DiscountCode {
  id: string
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  max_uses: number | null
  uses_count: number
  valid_until: string | null
  is_active: boolean
}

const inputCls = 'w-full rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface)] px-3 py-2 text-sm text-[var(--pz-text)] focus:border-[var(--pz-teal)] focus:outline-none focus:ring-1 focus:ring-[var(--pz-teal)]'

export function DiscountCodeManager({ eventId, initial }: { eventId: string; initial: DiscountCode[] }) {
  const [codes, setCodes] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [code, setCode] = useState('')
  const [value, setValue] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!code.trim() || !value) { setError('Code and value are required'); return }
    setPending(true)
    setError(null)
    const result = await createDiscountCode(eventId, {
      code: code.trim().toUpperCase(),
      discount_type: discountType,
      discount_value: parseInt(value, 10),
      max_uses: maxUses ? parseInt(maxUses, 10) : null,
      valid_until: validUntil || null,
      is_active: true,
    })
    setPending(false)
    if ('error' in result) { setError(result.error ?? null); return }
    if ('data' in result) {
      setCodes(prev => [result.data as DiscountCode, ...prev])
      setShowForm(false)
      setCode(''); setValue(''); setMaxUses(''); setValidUntil('')
    }
  }

  async function handleToggle(c: DiscountCode) {
    await toggleDiscountCode(eventId, c.id, !c.is_active)
    setCodes(prev => prev.map(d => d.id === c.id ? { ...d, is_active: !d.is_active } : d))
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this discount code?')) return
    await deleteDiscountCode(eventId, id)
    setCodes(prev => prev.filter(d => d.id !== id))
  }

  function fmtDiscount(c: DiscountCode) {
    return c.discount_type === 'percent' ? `${c.discount_value}%` : `$${(c.discount_value / 100).toFixed(2)}`
  }

  return (
    <div className="max-w-2xl mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[var(--pz-text)]">Discount codes</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
          >
            + Create code
          </button>
        )}
      </div>

      {codes.length > 0 && (
        <div className="mb-6 border border-[var(--pz-border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]">
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--pz-muted)]">Code</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--pz-muted)]">Discount</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--pz-muted)]">Uses</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--pz-muted)]">Expires</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--pz-muted)]">Active</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {codes.map(c => (
                <tr key={c.id} className="border-t border-[var(--pz-border)]">
                  <td className="px-3 py-2 font-mono font-bold text-[var(--pz-teal-ink)]">{c.code}</td>
                  <td className="px-3 py-2 text-[var(--pz-text)]">{fmtDiscount(c)}</td>
                  <td className="px-3 py-2 text-[var(--pz-muted)]">{c.uses_count}{c.max_uses ? `/${c.max_uses}` : ''}</td>
                  <td className="px-3 py-2 text-[var(--pz-muted)]">{c.valid_until ? new Date(c.valid_until).toLocaleDateString() : '—'}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleToggle(c)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.is_active ? 'bg-[var(--pz-teal)]/20 text-[var(--pz-teal-ink)]' : 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)]'}`}
                    >
                      {c.is_active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => handleDelete(c.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {codes.length === 0 && !showForm && (
        <p className="text-sm text-[var(--pz-muted)] mb-4">No discount codes yet.</p>
      )}

      {showForm && (
        <div className="pz-card p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[var(--pz-text)]">New discount code</h3>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" htmlFor="dc-code" required>
              <input
                id="dc-code"
                className={inputCls}
                placeholder="SUMMER20"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Type" htmlFor="dc-type" required>
              <select id="dc-type" className={inputCls} value={discountType} onChange={e => setDiscountType(e.target.value as 'percent' | 'fixed')}>
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed amount (cents)</option>
              </select>
            </Field>
            <Field label={discountType === 'percent' ? 'Percent off' : 'Amount off (cents)'} required htmlFor="dc-amount">
              <input
                id="dc-amount"
                type="number"
                min="1"
                className={inputCls}
                placeholder={discountType === 'percent' ? '20' : '500 = $5.00'}
                value={value}
                onChange={e => setValue(e.target.value)}
              />
            </Field>
            <Field label="Max uses (blank = unlimited)" htmlFor="dc-maxuses">
              <input
                id="dc-maxuses"
                type="number"
                min="1"
                className={inputCls}
                placeholder="—"
                value={maxUses}
                onChange={e => setMaxUses(e.target.value)}
              />
            </Field>
            <div className="col-span-2">
              <Field label="Expires (optional)" htmlFor="dc-expires">
                <input
                  id="dc-expires"
                  type="date"
                  className={inputCls}
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={pending}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              {pending ? 'Creating…' : 'Create code'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[var(--pz-border)] px-4 py-2 text-sm text-[var(--pz-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
