'use client'

import { useState } from 'react'
import { createFormField, deleteFormField, reorderFormFields } from '@/lib/events/form-field-actions'

interface FormField {
  id: string
  label: string
  field_type: string
  options: string[] | null
  is_required: boolean
  sort_order: number
  ticket_type_id: string | null
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text:     'Short text',
  textarea: 'Long text',
  select:   'Dropdown',
  checkbox: 'Checkbox',
  radio:    'Radio',
  email:    'Email',
  phone:    'Phone',
  date:     'Date',
}

const OPTION_TYPES = ['select', 'radio', 'checkbox']

const inputCls = 'w-full rounded-lg border border-[#1E3A5F] bg-[#112240] px-3 py-2 text-sm text-[#F0F4F8] focus:border-[#2DD4BF] focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]'
const labelCls = 'mb-1 block text-xs font-medium text-[#94A3B8]'

interface Props {
  eventId: string
  initial: FormField[]
  tickets: { id: string; name: string }[]
}

export function FormFieldManager({ eventId, initial, tickets }: Props) {
  const [fields, setFields] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [fieldType, setFieldType] = useState('text')
  const [label, setLabel] = useState('')
  const [options, setOptions] = useState<string[]>([''])
  const [isRequired, setIsRequired] = useState(false)
  const [ticketTypeId, setTicketTypeId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  function resetForm() {
    setLabel('')
    setFieldType('text')
    setOptions([''])
    setIsRequired(false)
    setTicketTypeId('')
    setError(null)
    setShowForm(false)
  }

  async function handleCreate() {
    if (!label.trim()) { setError('Label is required'); return }
    setPending(true)
    setError(null)
    const opts = OPTION_TYPES.includes(fieldType)
      ? options.map(o => o.trim()).filter(Boolean)
      : null
    const result = await createFormField(eventId, {
      label: label.trim(),
      field_type: fieldType,
      options: opts,
      is_required: isRequired,
      sort_order: fields.length,
      ticket_type_id: ticketTypeId || null,
    })
    setPending(false)
    if (result.error) { setError(result.error); return }
    if (result.data) {
      setFields(prev => [...prev, result.data as FormField])
      resetForm()
    }
  }

  async function handleDelete(fieldId: string) {
    setDeleting(fieldId)
    await deleteFormField(fieldId)
    setDeleting(null)
    setFields(prev => prev.filter(f => f.id !== fieldId))
  }

  async function handleMove(idx: number, dir: -1 | 1) {
    const next = [...fields]
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= next.length) return
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    setFields(next)
    await reorderFormFields(next.map(f => f.id))
  }

  return (
    <div className="max-w-2xl mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[#F0F4F8]">Registration questions</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            + Add question
          </button>
        )}
      </div>

      {fields.length > 0 && (
        <div className="mb-6 border border-[#1E3A5F] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E3A5F] bg-[#0D1B2A]">
                <th className="px-3 py-2 text-left text-xs font-medium text-[#64748B]">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[#64748B]">Question</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[#64748B]">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[#64748B]">Required</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {fields.map((f, idx) => (
                <tr key={f.id} className="border-t border-[#1E3A5F]">
                  <td className="px-3 py-2 text-[#64748B]">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} className="text-[10px] text-[#64748B] hover:text-[#94A3B8] disabled:opacity-30">▲</button>
                      <button onClick={() => handleMove(idx, 1)} disabled={idx === fields.length - 1} className="text-[10px] text-[#64748B] hover:text-[#94A3B8] disabled:opacity-30">▼</button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#F0F4F8]">{f.label}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs rounded-full px-2 py-0.5 bg-[#1E3A5F] text-[#94A3B8]">
                      {FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[#94A3B8]">{f.is_required ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(f.id)}
                      disabled={deleting === f.id}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {deleting === f.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fields.length === 0 && !showForm && (
        <p className="text-sm text-[#64748B] mb-4">No custom questions yet. Attendees will only see the standard fields.</p>
      )}

      {showForm && (
        <div className="pz-card p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[#F0F4F8]">New question</h3>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Question label *</label>
              <input className={inputCls} placeholder="e.g. Dietary restrictions" value={label} onChange={e => setLabel(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Field type *</label>
              <select className={inputCls} value={fieldType} onChange={e => { setFieldType(e.target.value); setOptions(['']) }}>
                {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {tickets.length > 0 && (
              <div>
                <label className={labelCls}>Ticket scope</label>
                <select className={inputCls} value={ticketTypeId} onChange={e => setTicketTypeId(e.target.value)}>
                  <option value="">All tickets</option>
                  {tickets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2 flex items-center gap-2">
              <input id="ff_required" type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} className="rounded" />
              <label htmlFor="ff_required" className="text-sm text-[#94A3B8] cursor-pointer">Required</label>
            </div>
            {OPTION_TYPES.includes(fieldType) && (
              <div className="col-span-2">
                <label className={labelCls}>Options (one per line)</label>
                <div className="flex flex-col gap-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className={inputCls}
                        value={opt}
                        placeholder={`Option ${i + 1}`}
                        onChange={e => {
                          const next = [...options]
                          next[i] = e.target.value
                          setOptions(next)
                        }}
                      />
                      {options.length > 1 && (
                        <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 text-sm px-2">×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setOptions([...options, ''])} className="text-xs text-[#64748B] hover:text-[#94A3B8] text-left">+ Add option</button>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={pending}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              {pending ? 'Adding…' : 'Add question'}
            </button>
            <button type="button" onClick={resetForm} className="rounded-lg border border-[#1E3A5F] px-4 py-2 text-sm text-[#94A3B8]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
