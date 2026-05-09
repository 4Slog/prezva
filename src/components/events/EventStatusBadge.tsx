'use client'

const STATUS_STYLES: Record<string, { label: string; style: string }> = {
  draft:     { label: 'Draft',     style: 'bg-[#1E3A5F] text-[#94A3B8]' },
  published: { label: 'Published', style: 'bg-[#00BFA6]/10 text-[#00BFA6] border border-[#00BFA6]/30' },
  live:      { label: '● LIVE',    style: 'bg-[#F43F5E] text-white animate-pulse' },
  ended:     { label: 'Ended',     style: 'bg-[#1E3A5F] text-[#64748B]' },
  cancelled: { label: 'Cancelled', style: 'bg-[#EF4444]/10 text-[#EF4444]' },
  archived:  { label: 'Archived',  style: 'bg-[#1E3A5F] text-[#64748B]' },
}

export function EventStatusBadge({ status }: { status: string }) {
  const { label, style } = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {label}
    </span>
  )
}
