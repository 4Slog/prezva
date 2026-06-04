'use client'

interface ChecklistItem {
  label: string
  done: boolean
  href?: string
}

interface SetupChecklistProps {
  items: ChecklistItem[]
}

export function SetupChecklist({ items }: SetupChecklistProps) {
  const doneCount = items.filter(i => i.done).length
  const progress = Math.round((doneCount / items.length) * 100)

  return (
    <div className="rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--pz-text)]">Getting started</h2>
        <span className="text-xs text-[var(--pz-muted)]">{doneCount}/{items.length} complete</span>
      </div>
      <div className="h-1.5 bg-[var(--pz-border)] rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-[var(--pz-teal)] rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className={`h-5 w-5 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${item.done ? 'bg-[var(--pz-teal)] text-[var(--pz-on-accent)]' : 'border border-[var(--pz-border)] text-[var(--pz-muted)]'}`}>
              {item.done ? '✓' : i + 1}
            </span>
            {item.href && !item.done ? (
              <a href={item.href} className="text-sm text-[var(--pz-teal-ink)] hover:underline">{item.label}</a>
            ) : (
              <span className={`text-sm ${item.done ? 'text-[var(--pz-muted)] line-through' : 'text-[var(--pz-text)]'}`}>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
