'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createBadgeTemplate } from '@/lib/checkin/sprint7-actions'
import type { BadgeField } from '@/lib/checkin/sprint7-actions'

const FIELD_TYPES: { value: BadgeField['type']; label: string }[] = [
  { value: 'name', label: 'Attendee Name' },
  { value: 'ticket', label: 'Ticket Type' },
  { value: 'company', label: 'Company' },
  { value: 'email', label: 'Email' },
  { value: 'qr_code', label: 'QR Code' },
  { value: 'logo', label: 'Event Logo' },
  { value: 'custom_text', label: 'Custom Text' },
]

const PAPER_SIZES = [
  { value: 'badge_4x3', label: '4″ × 3″ Badge' },
  { value: 'badge_4x6', label: '4″ × 6″ Badge' },
  { value: 'avery_5160', label: 'Avery 5160 Label' },
  { value: 'letter', label: 'Letter (8.5″ × 11″)' },
  { value: 'a4', label: 'A4' },
]

function newField(type: BadgeField['type']): BadgeField {
  return {
    id: crypto.randomUUID(),
    type,
    x: 10,
    y: 10,
    width: 80,
    font_size: type === 'qr_code' ? 0 : 16,
    font_weight: 'normal',
    color: '#0D1B2A',
    align: 'center',
    value: type === 'custom_text' ? 'Custom text' : undefined,
  }
}

function SortableFieldRow({
  field,
  onUpdate,
  onRemove,
}: {
  field: BadgeField
  onUpdate: (id: string, patch: Partial<BadgeField>) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })

  const inlineStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: 'var(--pz-surface-2)',
    border: '1px solid var(--pz-border)',
  }

  const cellInput = 'w-full rounded px-2 py-1 text-xs focus:outline-none'
  const cellStyle = { background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div ref={setNodeRef} style={inlineStyle} className="rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-xs opacity-40 hover:opacity-70 shrink-0"
          style={{ color: 'var(--pz-muted)' }}
        >
          ⋮⋮
        </button>
        <span className="text-xs font-medium flex-1" style={{ color: 'var(--pz-text)' }}>
          {FIELD_TYPES.find(t => t.value === field.type)?.label ?? field.type}
        </span>
        <button onClick={() => onRemove(field.id)} className="text-xs hover:opacity-70" style={{ color: 'var(--pz-error)' }}>✕</button>
      </div>

      {field.type === 'custom_text' && (
        <input
          value={field.value ?? ''}
          onChange={e => onUpdate(field.id, { value: e.target.value })}
          placeholder="Text content"
          className={cellInput}
          style={cellStyle}
        />
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <label className="text-xs" style={{ color: 'var(--pz-muted)' }}>X%</label>
          <input type="number" min={0} max={100} value={field.x}
            onChange={e => onUpdate(field.id, { x: Number(e.target.value) })}
            className={cellInput} style={cellStyle}
          />
        </div>
        <div>
          <label className="text-xs" style={{ color: 'var(--pz-muted)' }}>Y%</label>
          <input type="number" min={0} max={100} value={field.y}
            onChange={e => onUpdate(field.id, { y: Number(e.target.value) })}
            className={cellInput} style={cellStyle}
          />
        </div>
        <div>
          <label className="text-xs" style={{ color: 'var(--pz-muted)' }}>W%</label>
          <input type="number" min={10} max={100} value={field.width}
            onChange={e => onUpdate(field.id, { width: Number(e.target.value) })}
            className={cellInput} style={cellStyle}
          />
        </div>
      </div>

      {field.type !== 'qr_code' && field.type !== 'logo' && (
        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <label className="text-xs" style={{ color: 'var(--pz-muted)' }}>Size</label>
            <input type="number" min={8} max={72} value={field.font_size}
              onChange={e => onUpdate(field.id, { font_size: Number(e.target.value) })}
              className={cellInput} style={cellStyle}
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--pz-muted)' }}>Color</label>
            <input type="color" value={field.color}
              onChange={e => onUpdate(field.id, { color: e.target.value })}
              className="w-full h-7 rounded cursor-pointer"
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--pz-muted)' }}>Weight</label>
            <select value={field.font_weight}
              onChange={e => onUpdate(field.id, { font_weight: e.target.value as 'normal' | 'bold' })}
              className={cellInput} style={cellStyle}
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

export function BadgeDesigner({ eventId }: { eventId: string }) {
  const [name, setName] = useState('New Badge Template')
  const [paperSize, setPaperSize] = useState('badge_4x3')
  const [background, setBackground] = useState('#ffffff')
  const [fields, setFields] = useState<BadgeField[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor))

  function addField(type: BadgeField['type']) {
    setFields(prev => [...prev, newField(type)])
  }

  function updateField(id: string, patch: Partial<BadgeField>) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  }

  function removeField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFields(prev => {
      const oldIdx = prev.findIndex(f => f.id === active.id)
      const newIdx = prev.findIndex(f => f.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  async function handleSave() {
    setSaving(true)
    await createBadgeTemplate(eventId, {
      name,
      paper_size: paperSize,
      template_json: { fields, background, font_family: 'Inter' },
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="pz-card p-5 space-y-5">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>Create new template</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Template name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Paper size</label>
          <select value={paperSize} onChange={e => setPaperSize(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle}
          >
            {PAPER_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Background color</label>
        <input type="color" value={background} onChange={e => setBackground(e.target.value)} className="h-7 w-12 rounded cursor-pointer" />
        <span className="text-xs font-mono" style={{ color: 'var(--pz-muted)' }}>{background}</span>
      </div>

      <div>
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--pz-muted)' }}>Add fields</p>
        <div className="flex flex-wrap gap-1.5">
          {FIELD_TYPES.map(ft => (
            <button
              key={ft.value}
              onClick={() => addField(ft.value)}
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
            >
              + {ft.label}
            </button>
          ))}
        </div>
      </div>

      {fields.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Fields — drag to reorder</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {fields.map(f => (
                  <SortableFieldRow key={f.id} field={f} onUpdate={updateField} onRemove={removeField} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || fields.length === 0}
        className="w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
      >
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save template'}
      </button>
    </div>
  )
}
