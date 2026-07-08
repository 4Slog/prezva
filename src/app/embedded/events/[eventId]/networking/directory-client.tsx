'use client'
import { useState } from 'react'
import { Search } from 'lucide-react'

interface Attendee {
  user_id: string | null
  attendee_name: string
  attendee_email: string
  interests?: string[]
  profiles?: { id: string; full_name: string | null; avatar_url: string | null; job_title: string | null; company: string | null; bio: string | null } | null
}

const PAGE_SIZE = 25

export default function NetworkingDirectoryClient({ attendees }: { attendees: Attendee[] }) {
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filtered = attendees.filter(a => {
    const name = a.profiles?.full_name ?? a.attendee_name
    return name.toLowerCase().includes(search.toLowerCase()) ||
      (a.profiles?.company ?? '').toLowerCase().includes(search.toLowerCase())
  })
  const shown = filtered.slice(0, visibleCount)

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--pz-muted)' }} />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE) }}
          placeholder="Search attendees..."
          style={{ width: '100%', padding: '0.6rem 0.75rem 0.6rem 2rem', borderRadius: 8, border: '1px solid var(--pz-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>
      {filtered.length === 0 && <p style={{ color: 'var(--pz-muted)', textAlign: 'center', padding: '2rem 0' }}>No attendees found.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((a, i) => {
          const name = a.profiles?.full_name ?? a.attendee_name
          const initial = name.charAt(0).toUpperCase()
          return (
            <div key={a.user_id ?? i} className="pz-card" style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--pz-chrome)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--pz-teal)', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                {a.profiles?.avatar_url ? <img src={a.profiles.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)' }}>{name}</p>
                {a.profiles?.job_title && <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>{a.profiles.job_title}{a.profiles.company ? ' · ' + a.profiles.company : ''}</p>}
                {(a.interests ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {(a.interests ?? []).slice(0, 3).map((interest: string) => (
                      <span key={interest} style={{ fontSize: 10, background: 'rgba(45,212,191,0.12)', color: 'var(--pz-teal-ink)', borderRadius: 4, padding: '1px 6px' }}>{interest}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {visibleCount < filtered.length && (
        <button
          onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
          style={{ width: '100%', marginTop: 12, padding: '0.65rem', borderRadius: 8, border: '1px solid var(--pz-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Load more ({filtered.length - visibleCount} more)
        </button>
      )}
    </div>
  )
}
