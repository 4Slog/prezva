'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { searchAttendeeProfiles } from '@/lib/networking/sprint8-actions'

interface Profile {
  id: string
  registration_id: string
  name: string
  company: string
  job_title: string
  bio: string
  interests: string[]
  avatar_url: string | null
  ticket_name: string
}

export function PeopleClient({
  eventSlug,
  eventId,
  initialProfiles,
  initialQuery,
  userId,
}: {
  eventSlug: string
  eventId: string
  initialProfiles: Profile[]
  initialQuery: string
  userId: string | null
}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
  const [searching, setSearching] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setSearching(true)
    const results = await searchAttendeeProfiles(eventId, q)
    setProfiles(results as Profile[])
    setSearching(false)
    router.replace(`/e/${eventSlug}/people${q ? `?q=${encodeURIComponent(q)}` : ''}`, { scroll: false })
  }, [eventId, eventSlug, router])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch(query)
  }

  const inputStyle = { background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div>
      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, company, title, interest…"
          className="flex-1 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
          style={inputStyle}
        />
        <button
          onClick={() => handleSearch(query)}
          disabled={searching}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
        >
          {searching ? '…' : 'Search'}
        </button>
        {query && (
          <button
            onClick={() => { setQuery(''); handleSearch('') }}
            className="rounded-lg px-3 py-2.5 text-sm"
            style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Profile grid */}
      {profiles.length === 0 ? (
        <div className="pz-card p-12 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            {query ? `No profiles matching "${query}"` : 'No attendee profiles yet.'}
          </p>
          {!userId && (
            <p className="text-xs mt-2" style={{ color: 'var(--pz-muted)' }}>
              <a href="/login" style={{ color: 'var(--pz-teal)' }}>Sign in</a> and add your profile to show up here.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map(p => (
            <a
              key={p.id}
              href={`/e/${eventSlug}/people/${p.registration_id}`}
              className="pz-card p-4 hover:opacity-90 transition-opacity"
              style={{ textDecoration: 'none' }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="rounded-full shrink-0 flex items-center justify-center text-sm font-semibold"
                  style={{
                    width: 40,
                    height: 40,
                    background: p.avatar_url ? undefined : 'var(--pz-teal)',
                    color: 'var(--pz-on-accent)',
                    overflow: 'hidden',
                  }}
                >
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    p.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--pz-text)' }}>{p.name}</p>
                  {(p.job_title || p.company) && (
                    <p className="text-xs truncate" style={{ color: 'var(--pz-muted)' }}>
                      {[p.job_title, p.company].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {p.bio && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--pz-label)' }}>{p.bio}</p>
                  )}
                  {p.interests.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.interests.slice(0, 3).map(interest => (
                        <span key={interest} className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}>
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
