import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

interface Props {
  label: string
  icon: LucideIcon
  stat: string
  statLabel: string
  href: string
  isAlert?: boolean
}

export function EventGroupCard({ label, icon: Icon, stat, statLabel, href, isAlert }: Props) {
  return (
    <Link
      href={href}
      className="pz-card p-4 flex flex-col gap-2 cursor-pointer hover:border-[var(--pz-teal)] transition-colors group"
      style={isAlert ? { borderColor: 'var(--pz-warning)' } : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon
            size={14}
            style={{ color: isAlert ? 'var(--pz-warning)' : 'var(--pz-teal-ink)' }}
          />
          <span
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: 'var(--pz-muted)' }}
          >
            {label}
          </span>
        </div>
        <ChevronRight
          size={12}
          className="text-[var(--pz-muted)] group-hover:text-[var(--pz-teal-ink)] transition-colors flex-shrink-0"
        />
      </div>
      <div>
        <p
          className="text-2xl font-bold leading-tight"
          style={{ color: isAlert ? 'var(--pz-warning)' : 'var(--pz-teal-ink)' }}
        >
          {stat}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
          {statLabel}
        </p>
      </div>
    </Link>
  )
}
