'use client'

import { useState, useTransition } from 'react'
import { saveSpeakerFormSchema } from '@/lib/speaker/speaker-actions'

type Field = { key: string; label: string; type: string; required: boolean }

export function SpeakerFormBuilderClient({ eventId, initialSchema }: { eventId: string; initialSchema: any[] }) {
  const [fields, setFields] = useState<Field[]>(initialSchema.length > 0 ? initialSchema : [
    { key: 'bio', label: 'Bio', type: 'textarea', required: true },
    { key: 'headshot_url', label: 'Headshot URL', type: 'url', required: false },
    { key: 'linkedin_url', label: 'LinkedIn URL', type: 'url', required: false },
    { key: 'twitter_handle', label: 'Twitter / X handle', type: 'text', required: false },
    { key: 'special_requirements', label: 'Special requirements', type: 'textarea', required: false },
  ])
  const [saved, setSaved] = useState(false)
  const [, startTransition] = useTransition()

  function addField() {
    setFields([...fields, { key: `field_${Date.now()}`, label: '', type: 'text', required: false }])
  }

  function removeField(idx: number) {
    setFields(fields.filter((_, i) => i !== idx))
  }

  function updateField(idx: number, patch: Partial<Field>) {
    setFields(fields.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  function save() {
    startTransition(async () => {
      await saveSpeakerFormSchema(eventId, fields)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="max-w-xl">
      <div className="space-y-3 mb-6">
        {fields.map((field, idx) => (
          <div key={idx} className="pz-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--pz-label)' }}>Label</label>
                    <input
                      className="pz-input w-full text-sm"
                      value={field.label}
                      onChange={e => updateField(idx, { label: e.target.value })}
                      placeholder="Field label"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--pz-label)' }}>Type</label>
                    <select
                      className="pz-input text-sm"
                      value={field.type}
                      onChange={e => updateField(idx, { type: e.target.value })}
                    >
                      <option value="text">Text</option>
                      <option value="textarea">Textarea</option>
                      <option value="url">URL</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--pz-muted)' }}>
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={e => updateField(idx, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>
              <button
                onClick={() => removeField(idx)}
                className="text-xs mt-5"
                style={{ color: 'var(--pz-error, #ef4444)' }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={addField} className="text-sm" style={{ color: 'var(--pz-teal)' }}>+ Add field</button>
        <div className="flex-1" />
        <button onClick={save} className="pz-btn-primary text-sm px-5 py-2">Save form</button>
        {saved && <span className="text-xs" style={{ color: 'var(--pz-success)' }}>Saved!</span>}
      </div>
    </div>
  )
}
