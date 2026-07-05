export function HandleTag({ handle, className }: { handle?: string | null; className?: string }) {
  if (!handle) return null
  return (
    <span className={`text-xs ${className ?? ''}`} style={{ color: 'var(--pz-muted)' }}>@{handle}</span>
  )
}
