export function Avatar({
  name,
  avatarUrl,
  size = 40,
}: {
  name?: string | null
  avatarUrl?: string | null
  size?: number
}) {
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: avatarUrl ? undefined : 'var(--pz-teal)',
        color: 'var(--pz-on-accent)',
        overflow: 'hidden',
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        name?.charAt(0).toUpperCase() ?? '?'
      )}
    </div>
  )
}
