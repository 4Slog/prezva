'use client'

import { useState } from 'react'
import { voteForPhoto } from '@/lib/engagement/sprint10-actions'

type Props = {
  eventId: string
  eventSlug: string
  initialEntries: any[]
}

export function PhotosClient({ eventId, eventSlug, initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [voted, setVoted] = useState<Set<string>>(new Set())

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setUploadError('File must be under 10 MB'); return }
    setUploading(true)
    setUploadError('')
    const form = new FormData()
    form.append('file', file)
    form.append('caption', caption)
    form.append('eventId', eventId)
    const res = await fetch('/api/photo-upload', { method: 'POST', body: form })
    const json = await res.json()
    if (json.error) { setUploadError(json.error) } else {
      setEntries(prev => [{ ...json.entry, url: json.url }, ...prev])
      setCaption('')
    }
    setUploading(false)
    e.target.value = ''
  }

  async function vote(entryId: string) {
    if (voted.has(entryId)) return
    setVoted(prev => new Set(prev).add(entryId))
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, vote_count: e.vote_count + 1 } : e))
    await voteForPhoto(entryId)
  }

  return (
    <div>
      {/* Upload */}
      <div className="pz-card p-4 mb-6">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-label)', marginBottom: 8 }}>Share a photo</p>
        <input
          className="pz-input w-full text-sm mb-2"
          placeholder="Caption (optional)"
          value={caption}
          onChange={e => setCaption(e.target.value)}
        />
        <label style={{ cursor: 'pointer', color: 'var(--pz-teal)', fontSize: 13 }}>
          {uploading ? 'Uploading…' : '+ Upload photo'}
          <input type="file" className="sr-only" accept="image/*" onChange={handleUpload} disabled={uploading} />
        </label>
        {uploadError && <p style={{ fontSize: 12, color: 'var(--pz-error, var(--pz-error))', marginTop: 4 }}>{uploadError}</p>}
      </div>

      {entries.length === 0 ? (
        <div className="pz-card p-8 text-center">
          <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>No photos yet. Be the first to share one!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {entries.map((entry: any) => (
            <div key={entry.id} className="pz-card overflow-hidden">
              {entry.url && (
                <img src={entry.url} alt={entry.caption ?? ''} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
              )}
              <div style={{ padding: '0.75rem' }}>
                {entry.caption && <p style={{ fontSize: 12, color: 'var(--pz-text)', marginBottom: 6 }}>{entry.caption}</p>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    onClick={() => vote(entry.id)}
                    disabled={voted.has(entry.id)}
                    style={{ fontSize: 13, color: voted.has(entry.id) ? 'var(--pz-teal)' : 'var(--pz-muted)', background: 'none', border: 'none', cursor: voted.has(entry.id) ? 'default' : 'pointer' }}
                  >
                    ❤️ {entry.vote_count}
                  </button>
                  {entry.is_winner && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pz-warning-fill)' }}>🏆 Winner</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
