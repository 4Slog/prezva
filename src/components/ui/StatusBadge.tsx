import { Radio, CheckCircle2, AlertTriangle, XCircle, Info, Circle } from 'lucide-react'

export type StatusTone = 'live' | 'success' | 'warning' | 'error' | 'neutral' | 'info'

interface StatusBadgeProps {
  tone: StatusTone
  label: string
  className?: string
}

interface StatusBadgeClusterProps {
  children: React.ReactNode
  className?: string
}

interface ToneConfig {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  bg: string
  fg: string
}

const TONE_CONFIG: Record<StatusTone, ToneConfig> = {
  live:    { icon: Radio,         bg: 'var(--pz-live)',                                           fg: 'var(--pz-surface)' },
  success: { icon: CheckCircle2,  bg: 'var(--pz-success-bg)',                                     fg: 'var(--pz-success)' },
  warning: { icon: AlertTriangle, bg: 'color-mix(in srgb, var(--pz-amber) 12%, transparent)',     fg: 'var(--pz-warning)' },
  error:   { icon: XCircle,       bg: 'var(--pz-error-bg)',                                       fg: 'var(--pz-error)' },
  neutral: { icon: Circle,        bg: 'var(--pz-surface-2)',                                      fg: 'var(--pz-muted)' },
  info:    { icon: Info,          bg: 'color-mix(in srgb, var(--pz-teal) 10%, transparent)',      fg: 'var(--pz-teal-ink)' },
}

export function StatusBadge({ tone, label, className = '' }: StatusBadgeProps) {
  const { icon: Icon, bg, fg } = TONE_CONFIG[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      style={{ background: bg, color: fg }}
    >
      <Icon size={11} style={{ color: fg, flexShrink: 0 }} />
      {label}
    </span>
  )
}

export function StatusBadgeCluster({ children, className = '' }: StatusBadgeClusterProps) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {children}
    </div>
  )
}
