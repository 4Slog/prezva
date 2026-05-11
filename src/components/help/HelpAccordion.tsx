'use client'

import { useState } from 'react'

interface HelpAccordionItem {
  q: string
  a: string
}

interface HelpAccordionProps {
  items: HelpAccordionItem[]
}

export function HelpAccordion({ items }: HelpAccordionProps) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-[#1E3A5F] bg-[#112240] overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#F0F4F8] font-medium text-left hover:bg-[#1E3A5F]/40 transition-colors"
          >
            <span>{item.q}</span>
            <span className="ml-4 text-[#64748B] text-lg leading-none flex-shrink-0">{open === i ? '−' : '+'}</span>
          </button>
          {open === i && (
            <div className="px-4 pb-4 text-xs text-[#94A3B8] leading-relaxed">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
