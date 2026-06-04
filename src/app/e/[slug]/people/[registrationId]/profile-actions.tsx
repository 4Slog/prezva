'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Video } from 'lucide-react'
import { followAttendee, unfollowAttendee, sendMeetingRequest } from '@/lib/networking/sprint8-actions'
import { createOneOnOneRoom } from '@/lib/video/actions'

export function ProfileActions({
  eventId,
  eventSlug,
  targetUserId,
  targetName,
  registrationId,
  isFollowing: initialFollowing,
}: {
  eventId: string
  eventSlug: string
  targetUserId: string | null
  targetName: string
  registrationId: string
  isFollowing: boolean
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [showMeeting, setShowMeeting] = useState(false)
  const [meetingMsg, setMeetingMsg] = useState('')
  const [proposedTime, setProposedTime] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)

  async function handleFollow() {
    if (!targetUserId) return
    if (following) {
      await unfollowAttendee(eventId, targetUserId)
    } else {
      await followAttendee(eventId, targetUserId)
    }
    setFollowing(!following)
  }

  async function handleMeetingRequest() {
    if (!targetUserId) return
    setSending(true)
    await sendMeetingRequest(eventId, {
      recipient_id: targetUserId,
      message: meetingMsg,
      proposed_times: proposedTime ? [proposedTime] : [],
    })
    setSending(false)
    setSent(true)
    setShowMeeting(false)
    setTimeout(() => setSent(false), 3000)
  }

  async function handleVideoChat() {
    setVideoError(null)
    setVideoLoading(true)
    const result = await createOneOnOneRoom(registrationId, eventSlug)
    setVideoLoading(false)
    if ('error' in result) {
      setVideoError(result.error)
      return
    }
    router.push(result.meetUrl)
  }

  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="mt-4 pt-4 border-t space-y-3" style={{ borderColor: 'var(--pz-border)' }}>
      <div className="flex flex-wrap gap-2">
        {targetUserId && (
          <button
            onClick={handleFollow}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{
              background: following ? 'var(--pz-surface-2)' : 'var(--pz-teal)',
              color: following ? 'var(--pz-muted)' : 'var(--pz-on-accent)',
            }}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        )}
        {targetUserId && (
          <button
            onClick={() => setShowMeeting(!showMeeting)}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
          >
            Request meeting
          </button>
        )}
        {targetUserId && (
          <button
            onClick={handleVideoChat}
            disabled={videoLoading}
            className="rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
          >
            <Video size={14} />
            {videoLoading ? 'Connecting…' : 'Video chat'}
          </button>
        )}
      </div>

      {videoError && (
        <p className="text-sm" style={{ color: 'var(--pz-error)' }}>{videoError}</p>
      )}

      {sent && (
        <p className="text-sm" style={{ color: 'var(--pz-success)' }}>Meeting request sent to {targetName}!</p>
      )}

      {showMeeting && (
        <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--pz-label)' }}>Request a meeting with {targetName}</p>
          <div>
            <label className="mb-1 block text-xs" style={{ color: 'var(--pz-muted)' }}>Message (optional)</label>
            <textarea
              value={meetingMsg}
              onChange={e => setMeetingMsg(e.target.value)}
              rows={2}
              placeholder="Hi! I'd love to connect about…"
              className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none resize-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs" style={{ color: 'var(--pz-muted)' }}>Proposed time (optional)</label>
            <input
              type="datetime-local"
              value={proposedTime}
              onChange={e => setProposedTime(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleMeetingRequest}
              disabled={sending}
              className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              {sending ? 'Sending…' : 'Send request'}
            </button>
            <button
              onClick={() => setShowMeeting(false)}
              className="rounded-lg px-4 py-2 text-xs"
              style={{ color: 'var(--pz-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
