'use client'

import { useState } from 'react'
import { enableSessionLivestream, disableSessionLivestream } from '@/lib/video/actions'
import { Eye, EyeOff, Copy, Check } from 'lucide-react'

interface Props {
  sessionId: string
  eventSlug: string
  initialMuxStreamId: string | null
  initialMuxPlaybackId: string | null
}

export default function LivestreamSection({ sessionId, eventSlug, initialMuxStreamId, initialMuxPlaybackId }: Props) {
  const [streamId, setStreamId] = useState<string | null>(initialMuxStreamId)
  const [playbackId, setPlaybackId] = useState<string | null>(initialMuxPlaybackId)
  const [streamKey, setStreamKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)

  const isConfigured = !!streamId
  const RTMP_URL = 'rtmps://global-live.mux.com:443/app'

  async function handleToggle(enabled: boolean) {
    setLoading(true)
    setError(null)
    if (enabled) {
      const result = await enableSessionLivestream(sessionId, eventSlug) as
        { error: string } | { streamId: string; playbackId: string | null; rtmpUrl: string; streamKey: string | null }
      if ('error' in result) {
        setError(result.error)
      } else {
        setStreamId(result.streamId)
        setPlaybackId(result.playbackId ?? null)
        setStreamKey(result.streamKey ?? null)
      }
    } else {
      const result = await disableSessionLivestream(sessionId, eventSlug) as
        { error: string } | { success: true }
      if ('error' in result) {
        setError(result.error)
      } else {
        setStreamId(null)
        setPlaybackId(null)
        setStreamKey(null)
        setShowKey(false)
      }
    }
    setLoading(false)
  }

  async function copy(text: string, which: 'url' | 'key') {
    await navigator.clipboard.writeText(text)
    if (which === 'url') {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } else {
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    }
  }

  const statusPill = isConfigured ? (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
      background: 'rgba(234, 179, 8, 0.15)', color: '#d97706', border: '1px solid rgba(234,179,8,0.3)',
    }}>
      Ready
    </span>
  ) : (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
      background: 'rgba(100,116,139,0.15)', color: '#64748b', border: '1px solid rgba(100,116,139,0.3)',
    }}>
      Not configured
    </span>
  )

  return (
    <section className="pz-card p-6 mb-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 className="text-sm font-semibold text-[#F0F4F8]">Livestream</h2>
        {statusPill}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: loading ? 'default' : 'pointer' }}>
        <div style={{ position: 'relative', width: 40, height: 22, flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={isConfigured}
            disabled={loading}
            onChange={e => handleToggle(e.target.checked)}
            style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: loading ? 'default' : 'pointer', margin: 0 }}
          />
          <div style={{
            width: 40, height: 22, borderRadius: 11,
            background: isConfigured ? 'var(--pz-teal, #00BFA6)' : '#334155',
            transition: 'background 0.2s',
          }} />
          <div style={{
            position: 'absolute', top: 3, left: isConfigured ? 21 : 3,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text, #F0F4F8)', margin: 0 }}>
            Enable livestream for this session
          </p>
          <p style={{ fontSize: 12, color: 'var(--pz-muted, #94A3B8)', margin: '2px 0 0' }}>
            Creates a Mux live stream for this session and generates RTMP credentials.
          </p>
        </div>
      </label>

      {loading && (
        <p style={{ fontSize: 13, color: 'var(--pz-muted, #94A3B8)', marginTop: 12 }}>
          {isConfigured ? 'Disabling…' : 'Creating stream…'}
        </p>
      )}

      {error && (
        <p style={{ fontSize: 13, color: '#ef4444', marginTop: 12 }}>{error}</p>
      )}

      {isConfigured && !loading && (
        <div style={{ marginTop: 20, borderTop: '1px solid #1E3A5F', paddingTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* RTMP Server URL */}
            <div>
              <p style={{ fontSize: 12, color: 'var(--pz-muted, #94A3B8)', marginBottom: 6, fontWeight: 600 }}>RTMP Server URL</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{
                  flex: 1, fontSize: 12, padding: '8px 12px', borderRadius: 6,
                  background: '#0D1B2A', border: '1px solid #1E3A5F', color: '#F0F4F8',
                  fontFamily: 'monospace', wordBreak: 'break-all',
                }}>
                  {RTMP_URL}
                </code>
                <button
                  onClick={() => copy(RTMP_URL, 'url')}
                  title="Copy RTMP URL"
                  style={{
                    padding: '6px 8px', borderRadius: 6, border: '1px solid #1E3A5F',
                    background: '#112240', color: copiedUrl ? '#00BFA6' : '#94A3B8',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0,
                  }}
                >
                  {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Stream Key */}
            <div>
              <p style={{ fontSize: 12, color: 'var(--pz-muted, #94A3B8)', marginBottom: 6, fontWeight: 600 }}>Stream Key</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{
                  flex: 1, fontSize: 12, padding: '8px 12px', borderRadius: 6,
                  background: '#0D1B2A', border: '1px solid #1E3A5F', color: '#F0F4F8',
                  fontFamily: 'monospace', wordBreak: 'break-all', letterSpacing: showKey ? 'normal' : 2,
                }}>
                  {streamKey
                    ? (showKey ? streamKey : '••••••••••••••••')
                    : '(key not recoverable — disable and re-enable to reset stream)'}
                </code>
                {streamKey && (
                  <>
                    <button
                      onClick={() => setShowKey(v => !v)}
                      title={showKey ? 'Hide key' : 'Reveal key'}
                      style={{
                        padding: '6px 8px', borderRadius: 6, border: '1px solid #1E3A5F',
                        background: '#112240', color: '#94A3B8', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', flexShrink: 0,
                      }}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={() => copy(streamKey, 'key')}
                      title="Copy stream key"
                      style={{
                        padding: '6px 8px', borderRadius: 6, border: '1px solid #1E3A5F',
                        background: '#112240', color: copiedKey ? '#00BFA6' : '#94A3B8',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0,
                      }}
                    >
                      {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Encoder callout */}
            <p style={{
              fontSize: 12, color: 'var(--pz-muted, #94A3B8)',
              background: '#112240', border: '1px solid #1E3A5F',
              borderRadius: 6, padding: '8px 12px', margin: 0,
            }}>
              Paste these into OBS → Settings → Stream, or any RTMP encoder (vMix, Zoom custom stream, hardware encoders)
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
