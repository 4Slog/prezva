'use client'

import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusTone } from '@/components/ui/StatusBadge'

interface StatusMapping {
  tone: StatusTone
  label: string
}

const STATUS_MAP: Record<string, StatusMapping> = {
  draft:     { tone: 'neutral', label: 'Draft' },
  published: { tone: 'info',    label: 'Published' },
  live:      { tone: 'live',    label: 'Live' },
  ended:     { tone: 'neutral', label: 'Ended' },
  cancelled: { tone: 'error',   label: 'Cancelled' },
  archived:  { tone: 'neutral', label: 'Archived' },
}

export function EventStatusBadge({ status }: { status: string }) {
  const mapping = STATUS_MAP[status] ?? STATUS_MAP.draft
  return <StatusBadge tone={mapping.tone} label={mapping.label} />
}
