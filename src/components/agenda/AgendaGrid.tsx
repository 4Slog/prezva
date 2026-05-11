'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Session, Track, Room } from '@/lib/agenda/actions'
import { formatEventTime, formatEventDate } from '@/lib/utils/datetime'
import { getSessionTicketAccess, setSessionTicketAccess } from '@/lib/registration/sprint5-actions'
import { updateSessionSortOrders } from '@/lib/agenda/sprint6-actions'

interface TicketTypeSummary {
  id: string
  name: string
}

interface AgendaGridProps {
  sessions: Session[]
  tracks: Track[]
  rooms: Room[]
  timezone: string
  ticketTypes: TicketTypeSummary[]
  selected: Set<string>
  onToggleSelect: (sessionId: string) => void
  onEdit: (session: Session) => void
  onDelete: (sessionId: string) => void
}

const TYPE_HEX: Record<string, string> = {
  talk: '#0891b2',
  workshop: '#7c3aed',
  panel: '#d97706',
  keynote: '#059669',
  break: '#6b7280',
  networking: '#db2777',
  other: '#64748b',
}

function SessionAccessPanel({
  sessionId,
  ticketTypes,
}: {
  sessionId: string
  ticketTypes: TicketTypeSummary[]
}) {
  const [currentAccess, setCurrentAccess] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load() {
    if (currentAccess !== null) return
    setLoading(true)
    const ids = await getSessionTicketAccess(sessionId)
    setCurrentAccess(ids)
    setSelected(ids)
    setLoading(false)
  }

  function toggle(ticketTypeId: string) {
    setSelected((prev) =>
      prev.includes(ticketTypeId) ? prev.filter((id) => id !== ticketTypeId) : [...prev, ticketTypeId],
    )
  }

  async function save() {
    setSaving(true)
    await setSessionTicketAccess(sessionId, selected)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (ticketTypes.length === 0) {
    return (
      <p className="text-xs mt-2" style={{ color: 'var(--pz-muted)' }}>
        No ticket types — create tickets first.
      </p>
    )
  }

  if (currentAccess === null) {
    return (
      <button onClick={load} disabled={loading} className="text-xs mt-2 disabled:opacity-50" style={{ color: 'var(--pz-teal)' }}>
        {loading ? 'Loading…' : 'Configure access'}
      </button>
    )
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: 'var(--pz-border)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--pz-label)' }}>Ticket access control</p>
      <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>Leave all unchecked to allow all ticket types.</p>
      <div className="flex flex-wrap gap-2">
        {ticketTypes.map((tt) => (
          <label key={tt.id} className="flex items-center gap-1.5 cursor-pointer text-xs" style={{ color: 'var(--pz-muted)' }}>
            <input type="checkbox" checked={selected.includes(tt.id)} onChange={() => toggle(tt.id)} className="accent-[#00BFA6]" />
            {tt.name}
          </label>
        ))}
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
      >
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save access'}
      </button>
    </div>
  )
}

function SortableSessionCard({
  session,
  ticketTypes,
  selected,
  accessPanelId,
  onToggleSelect,
  onEdit,
  onDelete,
  onToggleAccess,
}: {
  session: Session
  ticketTypes: TicketTypeSummary[]
  selected: Set<string>
  accessPanelId: string | null
  onToggleSelect: (id: string) => void
  onEdit: (s: Session) => void
  onDelete: (id: string) => void
  onToggleAccess: (id: string) => void
} & { timezone?: string }) {
  const typeColor = TYPE_HEX[session.session_type] ?? TYPE_HEX.other
  const showAccess = accessPanelId === session.id
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl p-3"
    >
      <div
        className="rounded-xl p-3"
        style={{
          background: 'var(--pz-surface)',
          border: '1px solid ' + (selected.has(session.id) ? 'var(--pz-teal)' : 'var(--pz-border)'),
          borderLeft: '4px solid ' + (session.track?.color ?? typeColor),
        }}
      >
        <div className="flex items-start gap-3">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 mt-1 cursor-grab active:cursor-grabbing text-xs opacity-40 hover:opacity-70"
            style={{ color: 'var(--pz-muted)' }}
            title="Drag to reorder"
          >
            ⋮⋮
          </button>
          <input
            type="checkbox"
            checked={selected.has(session.id)}
            onChange={() => onToggleSelect(session.id)}
            className="mt-1 accent-[#00BFA6] shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>{session.title}</p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs" style={{ color: 'var(--pz-muted)' }}>
              <span
                className="rounded-full px-2 py-0.5 font-medium capitalize"
                style={{ background: typeColor + '22', color: typeColor }}
              >
                {session.session_type}
              </span>
              {session.track && <span>· {session.track.name}</span>}
              {session.room && <span>· {session.room.name}</span>}
              {session.speakers && session.speakers.length > 0 && (
                <span>· {session.speakers.map(sp => sp.name).join(', ')}</span>
              )}
              {session.capacity !== null && <span>· cap. {session.capacity}</span>}
            </div>
            {(session.tags ?? []).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(session.tags ?? []).map(tag => (
                  <span key={tag} className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-label)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-1 items-center">
            <button onClick={() => onToggleAccess(session.id)} className="rounded p-1 text-xs hover:opacity-70" style={{ color: 'var(--pz-label)' }} title="Access control">🔒</button>
            <button onClick={() => onEdit(session)} className="rounded p-1 text-xs hover:opacity-70" style={{ color: 'var(--pz-muted)' }} title="Edit">✎</button>
            <button onClick={() => onDelete(session.id)} className="rounded p-1 text-xs hover:opacity-70" style={{ color: 'var(--pz-error)' }} title="Delete">✕</button>
          </div>
        </div>
        {showAccess && <SessionAccessPanel sessionId={session.id} ticketTypes={ticketTypes} />}
      </div>
    </div>
  )
}

export function AgendaGrid({ sessions: initialSessions, tracks, timezone, ticketTypes, selected, onToggleSelect, onEdit, onDelete }: AgendaGridProps) {
  const [sessions, setSessions] = useState(initialSessions)
  const [accessPanelId, setAccessPanelId] = useState<string | null>(null)
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const allTags = Array.from(new Set(sessions.flatMap(s => s.tags ?? []))).sort()

  const filtered = activeTagFilter
    ? sessions.filter(s => (s.tags ?? []).includes(activeTagFilter))
    : sessions

  const byDate: Record<string, Session[]> = {}
  for (const s of filtered) {
    const day = s.starts_at.slice(0, 10)
    if (!byDate[day]) byDate[day] = []
    byDate[day].push(s)
  }
  const days = Object.keys(byDate).sort()

  async function handleDragEnd(event: DragEndEvent, dayKey: string) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const daySessions = byDate[dayKey]
    const oldIdx = daySessions.findIndex(s => s.id === active.id)
    const newIdx = daySessions.findIndex(s => s.id === over.id)
    const reordered = arrayMove(daySessions, oldIdx, newIdx)

    setSessions(prev => {
      const otherSessions = prev.filter(s => s.starts_at.slice(0, 10) !== dayKey)
      return [...otherSessions, ...reordered].sort((a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      )
    })

    await updateSessionSortOrders(reordered.map(s => s.id))
  }

  return (
    <div className="space-y-6">
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTagFilter(null)}
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: activeTagFilter === null ? 'var(--pz-teal)' : 'var(--pz-surface-2)', color: activeTagFilter === null ? '#0D1B2A' : 'var(--pz-muted)' }}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: activeTagFilter === tag ? 'var(--pz-teal)' : 'var(--pz-surface-2)', color: activeTagFilter === tag ? '#0D1B2A' : 'var(--pz-muted)' }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            {sessions.length === 0 ? 'No sessions yet. Add your first session above.' : `No sessions tagged "${activeTagFilter}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {days.map(day => (
            <div key={day}>
              <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--pz-muted)' }}>
                {formatEventDate(day + 'T12:00:00', timezone)}
              </h3>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleDragEnd(e, day)}
              >
                <SortableContext items={byDate[day].map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {byDate[day].map(s => (
                      <SortableSessionCard
                        key={s.id}
                        session={s}
                        ticketTypes={ticketTypes}
                        selected={selected}
                        accessPanelId={accessPanelId}
                        onToggleSelect={onToggleSelect}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onToggleAccess={(id) => setAccessPanelId(accessPanelId === id ? null : id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
