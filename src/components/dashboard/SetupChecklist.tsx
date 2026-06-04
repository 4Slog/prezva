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
    <div className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#F0F4F8]">Getting started</h2>
        <span className="text-xs text-[#64748B]">{doneCount}/{items.length} complete</span>
      </div>
      <div className="h-1.5 bg-[#1E3A5F] rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-[#2DD4BF] rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className={`h-5 w-5 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${item.done ? 'bg-[#2DD4BF] text-[#0D1B2A]' : 'border border-[#1E3A5F] text-[#64748B]'}`}>
              {item.done ? '✓' : i + 1}
            </span>
            {item.href && !item.done ? (
              <a href={item.href} className="text-sm text-[#2DD4BF] hover:underline">{item.label}</a>
            ) : (
              <span className={`text-sm ${item.done ? 'text-[#64748B] line-through' : 'text-[#F0F4F8]'}`}>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
