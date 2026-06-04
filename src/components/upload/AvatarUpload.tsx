'use client'
import { useState } from 'react'

export function AvatarUpload({ currentUrl }: { currentUrl?: string }) {
  const [avatarUrl, setAvatarUrl] = useState(currentUrl ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload/avatar', { method: 'POST', body: fd })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { setError(json.error); return }
    setAvatarUrl(json.url)
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0"
        style={{ background: 'var(--pz-surface-2)', border: '2px solid var(--pz-border)' }}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: 'var(--pz-muted)' }}>👤</div>
        }
      </div>
      <div>
        <label
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {uploading ? 'Uploading…' : 'Upload photo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleChange}
            disabled={uploading}
          />
        </label>
        <p className="text-xs mt-1" style={{ color: 'var(--pz-muted)' }}>JPEG, PNG or WebP, max 2MB</p>
        {error && <p className="text-xs text-[var(--pz-error)] mt-1">{error}</p>}
      </div>
      <input type="hidden" name="avatar_url" value={avatarUrl} />
    </div>
  )
}
