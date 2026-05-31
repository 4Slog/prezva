'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import LivePlayer from '@/components/video/LivePlayer'
import CEProgressBar from '@/components/video/CEProgressBar'
import LiveChat from '@/components/video/LiveChat'
import { ExternalLink } from 'lucide-react'
import OrganizerDashboard from '@/components/video/OrganizerDashboard'

const TABS = ['Chat', 'Q&A', 'Polls'] as const
type Tab = typeof TABS[number]

interface Props {
  session: {
    id: string
    title: string
    description: string | null
    ce_credit_hours: number | null
    mux_playback_id: string | null
    mux_stream_id: string | null
    starts_at: string | null
    ends_at: string | null
    slides_url: string | null
    recording_url: string | null
  }
  event: {
    id: string
    title: string
    slug: string
  }
  registrationId: string
  userId: string
  displayName: string
  isOrganizer?: boolean
}

export default function LivePageClient({ session, event, registrationId, userId, displayName, isOrganizer }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Chat')
  const [watchedSeconds, setWatchedSeconds] = useState(0)

  const isLive = !!session.mux_stream_id
  const hasVideo = !!session.mux_playback_id
  const ceCredits = session.ce_credit_hours ?? 0

  const sessionDurationSeconds = (() => {
    if (session.starts_at && session.ends_at) {
      return Math.max(0, (new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 1000)
    }
    return 3600
  })()

  function handleProgress(seconds: number) {
    setWatchedSeconds(prev => prev + seconds)
  }

  const watchPct = sessionDurationSeconds > 0 ? (watchedSeconds / sessionDurationSeconds) * 100 : 0

  return (
    <>
      {/* Mobile layout */}
      <div className="live-mobile-layout" style={{ display: 'none' }}>
        {hasVideo && (
          <div style={{ width: '100%', aspectRatio: '16/9' }}>
            <LivePlayer
              playbackId={session.mux_playback_id!}
              sessionTitle={session.title}
              isLive={isLive}
              registrationId={registrationId}
              sessionId={session.id}
              onProgress={handleProgress}
            />
          </div>
        )}
        {ceCredits > 0 && (
          <div style={{ padding: '0 16px' }}>
            <CEProgressBarDisplay watchedSeconds={watchedSeconds} sessionDurationSeconds={sessionDurationSeconds} ceCredits={ceCredits} watchPct={watchPct} />
          </div>
        )}
        <MobileTabs activeTab={activeTab} onSelect={setActiveTab} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TabContent activeTab={activeTab} session={session} event={event} registrationId={registrationId} userId={userId} displayName={displayName} />
        </div>
      </div>

      {/* Desktop layout */}
      <div className="live-desktop-layout" style={{ display: 'grid', gridTemplateColumns: '65fr 35fr', gap: 24, alignItems: 'start' }}>
        {/* Left column */}
        <div>
          {hasVideo ? (
            <LivePlayer
              playbackId={session.mux_playback_id!}
              sessionTitle={session.title}
              isLive={isLive}
              registrationId={registrationId}
              sessionId={session.id}
              onProgress={handleProgress}
            />
          ) : (
            <div style={{ width: '100%', aspectRatio: '16/9', background: '#111', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: '#666', fontSize: 14 }}>Stream not yet available</p>
            </div>
          )}

          {ceCredits > 0 && (
            <CEProgressBarDisplay watchedSeconds={watchedSeconds} sessionDurationSeconds={sessionDurationSeconds} ceCredits={ceCredits} watchPct={watchPct} />
          )}

          {session.description && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>{session.description}</p>
            </div>
          )}

          {(session.slides_url || session.recording_url) && (
            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
              {session.slides_url && (
                <a href={session.slides_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-teal)', textDecoration: 'none' }}>
                  <ExternalLink size={14} /> Slides
                </a>
              )}
              {session.recording_url && (
                <a href={session.recording_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-teal)', textDecoration: 'none' }}>
                  <ExternalLink size={14} /> Recording
                </a>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', height: 560, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                flex: 1, padding: '10px 0', fontSize: 13, fontWeight: activeTab === tab ? 700 : 400,
                border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab ? '2px solid var(--color-teal)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--color-teal)' : 'var(--color-text-muted)',
              }}>
                {tab}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <TabContent activeTab={activeTab} session={session} event={event} registrationId={registrationId} userId={userId} displayName={displayName} />
          </div>
        </div>
      </div>

      {isOrganizer && (
        <div style={{ marginTop: 32, borderTop: '1px solid var(--color-border)', paddingTop: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 }}>
            Organizer controls
          </p>
          <OrganizerDashboard
            sessionId={session.id}
            eventId={event.id}
            isLive={isLive}
          />
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .live-desktop-layout { display: none !important; }
          .live-mobile-layout { display: flex !important; flex-direction: column; min-height: 100vh; }
        }
      `}</style>
    </>
  )
}

function CEProgressBarDisplay({ watchedSeconds, sessionDurationSeconds, ceCredits, watchPct }: {
  watchedSeconds: number; sessionDurationSeconds: number; ceCredits: number; watchPct: number
}) {
  const threshold = sessionDurationSeconds * 0.8
  const barPct = threshold > 0 ? Math.min(100, (watchedSeconds / threshold) * 100) : 0
  const earned = watchPct >= 80
  const { CheckCircle } = require('lucide-react')
  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        {earned ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#2DD4BF' }}>
            <CheckCircle size={15} /> CE credit earned — {ceCredits} credit{ceCredits !== 1 ? 's' : ''}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {Math.round(watchPct)}% watched — watch 80% to earn {ceCredits} CE credit{ceCredits !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${barPct}%`, borderRadius: 3, background: earned ? '#2DD4BF' : '#6b7280', transition: 'width 0.4s ease, background 0.3s ease' }} />
      </div>
    </div>
  )
}

function TabContent({ activeTab, session, event, registrationId, userId, displayName }: {
  activeTab: Tab
  session: Props['session']
  event: Props['event']
  registrationId: string
  userId: string
  displayName: string
}) {
  if (activeTab === 'Chat') {
    return (
      <LiveChat
        eventId={event.id}
        sessionId={session.id}
        userId={userId}
        displayName={displayName}
      />
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 14 }}>
      {activeTab} — coming soon
    </div>
  )
}

function MobileTabs({ activeTab, onSelect }: { activeTab: Tab; onSelect: (t: Tab) => void }) {
  return (
    <div style={{ display: 'flex', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
      {TABS.map(tab => (
        <button key={tab} onClick={() => onSelect(tab)} style={{
          flex: 1, padding: '10px 0', fontSize: 13, fontWeight: activeTab === tab ? 700 : 400,
          border: 'none', background: 'none', cursor: 'pointer',
          color: activeTab === tab ? 'var(--color-teal)' : 'var(--color-text-muted)',
        }}>
          {tab}
        </button>
      ))}
    </div>
  )
}
