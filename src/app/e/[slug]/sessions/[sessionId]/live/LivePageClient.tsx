'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import LivePlayer from '@/components/video/LivePlayer'
import LiveRoom from '@/components/video/LiveRoom'
import SimulivePlayer from '@/components/video/SimulivePlayer'
import CEProgressBar from '@/components/video/CEProgressBar'
import LiveChat from '@/components/video/LiveChat'
import { ExternalLink, CheckCircle } from 'lucide-react'
import OrganizerDashboard from '@/components/video/OrganizerDashboard'
import QuestionQueue from '@/components/video/QuestionQueue'

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
    livekit_room_name: string | null
    starts_at: string | null
    ends_at: string | null
    slides_url: string | null
    recording_url: string | null
    mux_asset_playback_id: string | null
    allow_rewatch: boolean
    simulive_scheduled_at: string | null
    simulive_started_at: string | null
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
  const [viewerCount, setViewerCount] = useState(0)

  const isLive = !!session.mux_stream_id
  const hasVideo = !!session.mux_playback_id
  const hasLiveRoom = !!session.livekit_room_name
  const ceCredits = session.ce_credit_hours ?? 0

  // Compute once on mount — Date.now() in lazy initializer is safe
  const [simuliveActive] = useState(() =>
    !!session.simulive_scheduled_at &&
    !!session.mux_asset_playback_id &&
    Date.now() >= new Date(session.simulive_scheduled_at).getTime()
  )

  // Rewatch: stream has ended (mux_stream_id set but !isLive) and allow_rewatch is on
  const canRewatch =
    session.allow_rewatch &&
    !!session.mux_asset_playback_id &&
    !!session.mux_stream_id &&
    !isLive

  const sessionDurationSeconds = (() => {
    if (session.starts_at && session.ends_at) {
      return Math.max(0, (new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 1000)
    }
    return 3600
  })()

  const watchedSecondsRef = useRef(0)
  const lastSentRef = useRef(0)

  useEffect(() => {
    watchedSecondsRef.current = watchedSeconds
  }, [watchedSeconds])

  function handleProgress(seconds: number) {
    setWatchedSeconds(prev => prev + seconds)
  }

  // Persist running watch-time to session_attendance (Mux players only — not LiveKit).
  // 30s interval sends the running total; visibilitychange/pagehide flushes via sendBeacon.
  useEffect(() => {
    if (hasLiveRoom) return

    const url = `/api/e/${event.slug}/sessions/${session.id}/watch`

    function flush() {
      const w = watchedSecondsRef.current
      if (w <= 0) return
      navigator.sendBeacon(url, new Blob([JSON.stringify({ watchedSeconds: w })], { type: 'application/json' }))
    }

    const intervalId = setInterval(() => {
      const w = watchedSecondsRef.current
      if (w > 0 && w !== lastSentRef.current) {
        lastSentRef.current = w
        fetch(url, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchedSeconds: w }),
        }).catch(() => { /* fire-and-forget */ })
      }
    }, 30_000)

    function handleVisibility() {
      if (document.visibilityState === 'hidden') flush()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', flush)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [hasLiveRoom, event.slug, session.id])

  const watchPct = sessionDurationSeconds > 0 ? (watchedSeconds / sessionDurationSeconds) * 100 : 0

  return (
    <>
      {/* Mobile layout */}
      <div className="live-mobile-layout" style={{ display: 'none' }}>
        {hasLiveRoom ? (
          <div style={{ width: '100%' }}>
            {/* TODO(GE-7 piece 1b): LiveKit rooms emit no watch-time; virtual CE watch-credit for interactive sessions is deferred. */}
            <LiveRoom
              roomName={session.livekit_room_name!}
              sessionId={session.id}
              participantName={displayName}
              isOrganizer={!!isOrganizer}
              onParticipantCountChange={setViewerCount}
            />
          </div>
        ) : hasVideo && isLive ? (
          <div style={{ width: '100%', aspectRatio: '16/9' }}>
            <LivePlayer
              playbackId={session.mux_playback_id!}
              sessionTitle={session.title}
              isLive={true}
              viewerCount={viewerCount}
              registrationId={registrationId}
              sessionId={session.id}
              onProgress={handleProgress}
            />
          </div>
        ) : simuliveActive ? (
          <div style={{ width: '100%' }}>
            <SimulivePlayer
              playbackId={session.mux_asset_playback_id!}
              scheduledAt={session.simulive_scheduled_at!}
              sessionId={session.id}
              registrationId={registrationId}
              simuliveStartedAt={session.simulive_started_at}
              onProgress={handleProgress}
            />
          </div>
        ) : canRewatch ? (
          <div style={{ width: '100%', aspectRatio: '16/9' }}>
            <LivePlayer
              playbackId={session.mux_asset_playback_id!}
              sessionTitle={session.title}
              isLive={false}
              registrationId={registrationId}
              sessionId={session.id}
              onProgress={handleProgress}
            />
          </div>
        ) : null}
        {!hasLiveRoom && ceCredits > 0 && (
          <div style={{ padding: '0 16px' }}>
            <CEProgressBarDisplay watchedSeconds={watchedSeconds} sessionDurationSeconds={sessionDurationSeconds} ceCredits={ceCredits} watchPct={watchPct} />
          </div>
        )}
        {hasLiveRoom && ceCredits > 0 && (
          <div style={{ padding: '0 16px' }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>Attendance for this interactive session is recorded separately.</p>
          </div>
        )}
        <MobileTabs activeTab={activeTab} onSelect={setActiveTab} />
        <div style={{ flex: 1, overflow: 'hidden', paddingBottom: '3.5rem' }}>
          <TabContent activeTab={activeTab} session={session} event={event} registrationId={registrationId} userId={userId} displayName={displayName} isOrganizer={isOrganizer} />
        </div>
      </div>

      {/* Desktop layout */}
      <div className="live-desktop-layout" style={{ display: 'grid', gridTemplateColumns: '65fr 35fr', gap: 24, alignItems: 'start' }}>
        {/* Left column */}
        <div>
          {hasLiveRoom ? (
            <>
              {/* TODO(GE-7 piece 1b): LiveKit rooms emit no watch-time; virtual CE watch-credit for interactive sessions is deferred. */}
              <LiveRoom
                roomName={session.livekit_room_name!}
                sessionId={session.id}
                participantName={displayName}
                isOrganizer={!!isOrganizer}
                onParticipantCountChange={setViewerCount}
              />
            </>
          ) : hasVideo && isLive ? (
            <LivePlayer
              playbackId={session.mux_playback_id!}
              sessionTitle={session.title}
              isLive={true}
              viewerCount={viewerCount}
              registrationId={registrationId}
              sessionId={session.id}
              onProgress={handleProgress}
            />
          ) : simuliveActive ? (
            <SimulivePlayer
              playbackId={session.mux_asset_playback_id!}
              scheduledAt={session.simulive_scheduled_at!}
              sessionId={session.id}
              registrationId={registrationId}
              simuliveStartedAt={session.simulive_started_at}
              onProgress={handleProgress}
            />
          ) : canRewatch ? (
            <LivePlayer
              playbackId={session.mux_asset_playback_id!}
              sessionTitle={session.title}
              isLive={false}
              registrationId={registrationId}
              sessionId={session.id}
              onProgress={handleProgress}
            />
          ) : (
            <div style={{ width: '100%', aspectRatio: '16/9', background: 'var(--pz-chrome-2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--pz-chrome-muted)', fontSize: 14 }}>Stream not yet available</p>
            </div>
          )}

          {!hasLiveRoom && ceCredits > 0 && (
            <CEProgressBarDisplay watchedSeconds={watchedSeconds} sessionDurationSeconds={sessionDurationSeconds} ceCredits={ceCredits} watchPct={watchPct} />
          )}
          {hasLiveRoom && ceCredits > 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>Attendance for this interactive session is recorded separately.</p>
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
            <TabContent activeTab={activeTab} session={session} event={event} registrationId={registrationId} userId={userId} displayName={displayName} isOrganizer={isOrganizer} />
          </div>
        </div>
      </div>

      {isOrganizer && (
        <div style={{ marginTop: 32, borderTop: '1px solid var(--color-border)', paddingTop: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-chrome-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 }}>
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
          .live-mobile-layout { display: flex !important; flex-direction: column; min-height: 100dvh; }
          .live-tab-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 50; }
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
  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        {earned ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--pz-teal)' }}>
            <CheckCircle size={15} /> CE credit earned — {ceCredits} credit{ceCredits !== 1 ? 's' : ''}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {Math.round(watchPct)}% watched — watch 80% to earn {ceCredits} CE credit{ceCredits !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${barPct}%`, borderRadius: 3, background: earned ? 'var(--pz-teal)' : 'var(--pz-chrome-muted)', transition: 'width 0.4s ease, background 0.3s ease' }} />
      </div>
    </div>
  )
}

function TabContent({ activeTab, session, event, registrationId, userId, displayName, isOrganizer }: {
  activeTab: Tab
  session: Props['session']
  event: Props['event']
  registrationId: string
  userId: string
  displayName: string
  isOrganizer?: boolean
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
  if (activeTab === 'Q&A') {
    return (
      <QuestionQueue
        sessionId={session.id}
        eventId={event.id}
        isOrganizer={!!isOrganizer}
        userId={userId}
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
    <div className="live-tab-bar" style={{ display: 'flex', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
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
