'use client'

import { useState, useRef } from 'react'
import {
  enableRecording,
  disableRecording,
  enableRewatch,
  disableRewatch,
  getDownloadUrl,
  requestUploadUrl,
  finalizeVideoUpload,
  importVideoFromUrl,
  updateSimuliveSchedule,
} from '@/lib/video/actions'
import { AlertTriangle, Download, Upload, Link2, Clock } from 'lucide-react'
import { Field } from '@/components/ui/Field'

interface Props {
  sessionId: string
  eventSlug: string
  initialRecordingEnabled: boolean
  initialAllowRewatch: boolean
  initialMuxAssetId: string | null
  initialMuxAssetPlaybackId: string | null
  initialSimuliveScheduledAt: string | null
  hasMuxStream: boolean
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
  description,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: disabled ? 'default' : 'pointer' }}>
      <div style={{ position: 'relative', width: 40, height: 22, flexShrink: 0, marginTop: 1 }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: disabled ? 'default' : 'pointer', margin: 0 }}
        />
        <div style={{
          width: 40, height: 22, borderRadius: 11,
          background: checked ? 'var(--pz-teal)' : 'var(--pz-border)',
          transition: 'background 0.2s',
          opacity: disabled ? 0.5 : 1,
        }} />
        <div style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{label}</p>
        {description && (
          <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '2px 0 0' }}>{description}</p>
        )}
      </div>
    </label>
  )
}

export default function RecordingSection({
  sessionId,
  eventSlug,
  initialRecordingEnabled,
  initialAllowRewatch,
  initialMuxAssetId,
  initialMuxAssetPlaybackId,
  initialSimuliveScheduledAt,
  hasMuxStream,
}: Props) {
  const [recordingEnabled, setRecordingEnabled] = useState(initialRecordingEnabled)
  const [allowRewatch, setAllowRewatch] = useState(initialAllowRewatch)
  const [muxAssetId, setMuxAssetId] = useState(initialMuxAssetId)
  const [muxAssetPlaybackId, setMuxAssetPlaybackId] = useState(initialMuxAssetPlaybackId)
  const [simuliveScheduledAt, setSimuliveScheduledAt] = useState(initialSimuliveScheduledAt)
  const [scheduleDateInput, setScheduleDateInput] = useState(
    initialSimuliveScheduledAt
      ? new Date(initialSimuliveScheduledAt).toISOString().slice(0, 16)
      : ''
  )

  const [togglingRecording, setTogglingRecording] = useState(false)
  const [togglingRewatch, setTogglingRewatch] = useState(false)
  const [dismissedBanner, setDismissedBanner] = useState(false)
  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'processing'>('idle')

  // Upload state
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'ready' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [importingUrl, setImportingUrl] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Simulive state
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  async function handleToggleRecording(enabled: boolean) {
    setTogglingRecording(true)
    const result = enabled
      ? await enableRecording(sessionId, eventSlug)
      : await disableRecording(sessionId, eventSlug)
    if (!('error' in result)) {
      setRecordingEnabled(enabled)
      if (!enabled) setAllowRewatch(false)
    }
    setTogglingRecording(false)
  }

  async function handleToggleRewatch(enabled: boolean) {
    setTogglingRewatch(true)
    const result = enabled
      ? await enableRewatch(sessionId, eventSlug)
      : await disableRewatch(sessionId, eventSlug)
    if (!('error' in result)) setAllowRewatch(enabled)
    setTogglingRewatch(false)
  }

  async function handleDownload() {
    setDownloadState('loading')
    const result = await getDownloadUrl(sessionId, eventSlug)
    if ('url' in result) {
      window.open(result.url, '_blank')
      setDownloadState('idle')
    } else if ('processing' in result) {
      setDownloadState('processing')
      setTimeout(() => setDownloadState('idle'), 5000)
    } else {
      setDownloadState('idle')
    }
  }

  async function handleFileUpload(file: File) {
    setUploadStatus('uploading')
    setUploadProgress(0)
    setUploadError(null)

    const urlResult = await requestUploadUrl()
    if ('error' in urlResult) {
      setUploadError(urlResult.error ?? null)
      setUploadStatus('error')
      return
    }

    const { uploadId, uploadUrl } = urlResult

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new Error(`Upload failed: ${xhr.status}`))
      })
      xhr.addEventListener('error', () => reject(new Error('Network error')))
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')
      xhr.send(file)
    }).catch(err => {
      setUploadError(err.message)
      setUploadStatus('error')
    })

    if (uploadStatus === 'error') return

    setUploadStatus('processing')
    setUploadProgress(null)

    const finalResult = await finalizeVideoUpload(sessionId, uploadId, eventSlug)
    if ('error' in finalResult) {
      setUploadError(finalResult.error ?? null)
      setUploadStatus('error')
    } else if ('playbackId' in finalResult) {
      setMuxAssetPlaybackId(finalResult.playbackId ?? null)
      setUploadStatus('ready')
    }
  }

  async function handleImportUrl() {
    if (!urlInput.trim()) return
    setImportingUrl(true)
    setUploadError(null)
    const result = await importVideoFromUrl(sessionId, urlInput.trim(), eventSlug)
    if ('error' in result) {
      setUploadError(result.error ?? null)
    } else if ('playbackId' in result) {
      setMuxAssetPlaybackId(result.playbackId ?? null)
      setUploadStatus('ready')
    }
    setImportingUrl(false)
  }

  async function handleSaveSchedule() {
    setSavingSchedule(true)
    setScheduleError(null)
    const isoAt = scheduleDateInput ? new Date(scheduleDateInput).toISOString() : null
    const result = await updateSimuliveSchedule(sessionId, isoAt, eventSlug)
    if ('error' in result) {
      setScheduleError(result.error ?? null)
    } else {
      setSimuliveScheduledAt(isoAt)
    }
    setSavingSchedule(false)
  }

  async function handleCancelSchedule() {
    setSavingSchedule(true)
    const result = await updateSimuliveSchedule(sessionId, null, eventSlug)
    if (!('error' in result)) {
      setSimuliveScheduledAt(null)
      setScheduleDateInput('')
    }
    setSavingSchedule(false)
  }

  const showRecordingBanner = hasMuxStream && !recordingEnabled && !dismissedBanner

  return (
    <section className="pz-card p-6 mb-6">
      <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-4">Recording</h2>

      {/* Livestream-on + recording-off warning banner */}
      {showRecordingBanner && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8, padding: '10px 12px', marginBottom: 16,
        }}>
          <AlertTriangle size={15} style={{ color: 'var(--pz-warning-fill)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, fontSize: 12, color: 'var(--pz-warning)' }}>
            <span style={{ fontWeight: 600 }}>Recording is off</span> — the video will be deleted when the stream ends.
            Turn on recording to save it for download or attendee rewatch.
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => handleToggleRecording(true)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                background: 'var(--pz-warning-fill)', color: '#000', border: 'none', cursor: 'pointer',
              }}
            >
              Turn on
            </button>
            <button
              onClick={() => setDismissedBanner(true)}
              style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 6,
                background: 'transparent', color: 'var(--pz-warning)', border: '1px solid rgba(245,158,11,0.4)',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Toggle
          checked={recordingEnabled}
          disabled={togglingRecording}
          onChange={handleToggleRecording}
          label="Save recording after stream ends"
          description="The recording will be saved to your Mux account when the live stream ends."
        />

        {recordingEnabled && (
          <Toggle
            checked={allowRewatch}
            disabled={togglingRewatch}
            onChange={handleToggleRewatch}
            label="Allow attendees to rewatch"
            description="Confirmed registrants can watch the recording after the stream ends."
          />
        )}

        {/* Organizer download */}
        {muxAssetId && (
          <div style={{ borderTop: '1px solid var(--pz-border)', paddingTop: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--pz-muted)', marginBottom: 8 }}>Recording download</p>
            {downloadState === 'processing' ? (
              <p style={{ fontSize: 12, color: 'var(--pz-warning-fill)' }}>
                MP4 is still processing — check back in a few minutes.
              </p>
            ) : (
              <button
                onClick={handleDownload}
                disabled={downloadState === 'loading'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 7,
                  background: 'var(--pz-teal)', color: 'var(--pz-on-accent)',
                  border: 'none', cursor: downloadState === 'loading' ? 'default' : 'pointer',
                  opacity: downloadState === 'loading' ? 0.7 : 1,
                }}
              >
                <Download size={14} />
                {downloadState === 'loading' ? 'Fetching…' : 'Download MP4'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pre-recorded upload */}
      <div style={{ borderTop: '1px solid var(--pz-border)', paddingTop: 20, marginTop: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Pre-recorded video</p>
        <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 14 }}>
          Upload a video to use for simulive broadcasting or on-demand rewatch without running a live stream.
        </p>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 14, border: '1px solid var(--pz-border)', borderRadius: 7, overflow: 'hidden', width: 'fit-content' }}>
          {(['file', 'url'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setUploadMode(mode)}
              style={{
                fontSize: 12, fontWeight: 600, padding: '5px 14px',
                background: uploadMode === mode ? 'var(--pz-border)' : 'transparent',
                color: uploadMode === mode ? 'var(--pz-text)' : 'var(--pz-muted)',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {mode === 'file' ? <><Upload size={12} /> Upload file</> : <><Link2 size={12} /> Paste URL</>}
            </button>
          ))}
        </div>

        {uploadMode === 'file' ? (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }}
            />
            {uploadStatus === 'idle' || uploadStatus === 'error' ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 7,
                  background: 'var(--pz-surface)', border: '1px solid var(--pz-border)',
                  color: 'var(--pz-text)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Upload size={14} /> Choose video file
              </button>
            ) : uploadStatus === 'uploading' ? (
              <div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--pz-border)', overflow: 'hidden', marginBottom: 6, width: 280 }}>
                  <div style={{ height: '100%', background: 'var(--pz-teal)', width: `${uploadProgress ?? 0}%`, transition: 'width 0.3s' }} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>Uploading… {uploadProgress}%</p>
              </div>
            ) : uploadStatus === 'processing' ? (
              <p style={{ fontSize: 12, color: 'var(--pz-warning-fill)' }}>Processing video…</p>
            ) : uploadStatus === 'ready' ? (
              <p style={{ fontSize: 12, color: 'var(--pz-success-fill)', fontWeight: 600 }}>
                ✓ Video ready{muxAssetPlaybackId ? ` (${muxAssetPlaybackId.slice(0, 8)}…)` : ''}
              </p>
            ) : null}
            {uploadError && (
              <p style={{ fontSize: 12, color: 'var(--pz-error)', marginTop: 6 }}>{uploadError}</p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://example.com/video.mp4"
              style={{
                flex: 1, maxWidth: 360, fontSize: 13, padding: '7px 10px', borderRadius: 7,
                background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleImportUrl}
              disabled={importingUrl || !urlInput.trim()}
              style={{
                fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 7,
                background: 'var(--pz-teal)', color: 'var(--pz-on-accent)',
                border: 'none', cursor: importingUrl ? 'default' : 'pointer',
                opacity: importingUrl || !urlInput.trim() ? 0.6 : 1,
              }}
            >
              {importingUrl ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}
        {uploadStatus === 'ready' && muxAssetPlaybackId && uploadMode === 'url' && (
          <p style={{ fontSize: 12, color: 'var(--pz-success-fill)', fontWeight: 600, marginTop: 8 }}>
            ✓ Video imported
          </p>
        )}
        {uploadError && uploadMode === 'url' && (
          <p style={{ fontSize: 12, color: 'var(--pz-error)', marginTop: 6 }}>{uploadError}</p>
        )}
      </div>

      {/* Simulive scheduler — only when video is ready */}
      {muxAssetPlaybackId && (
        <div style={{ borderTop: '1px solid var(--pz-border)', paddingTop: 20, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <Clock size={14} style={{ color: 'var(--pz-muted)' }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Simulive broadcast</p>
          </div>
          <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 14 }}>
            Broadcast this recording as live at a scheduled time. Attendees will see the session as live with chat and Q&A active.
          </p>

          {simuliveScheduledAt ? (
            <div>
              <p style={{ fontSize: 13, color: 'var(--pz-success-fill)', fontWeight: 600, marginBottom: 8 }}>
                Scheduled for {new Date(simuliveScheduledAt).toLocaleString(undefined, {
                  dateStyle: 'medium', timeStyle: 'short',
                })} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
              </p>
              <button
                onClick={handleCancelSchedule}
                disabled={savingSchedule}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                  background: 'transparent', color: 'var(--pz-error)',
                  border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
                }}
              >
                Cancel broadcast
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Field label="Broadcast at:" htmlFor="simulive-broadcast-at" error={scheduleError ?? undefined}>
                <input
                  id="simulive-broadcast-at"
                  type="datetime-local"
                  value={scheduleDateInput}
                  onChange={e => setScheduleDateInput(e.target.value)}
                  style={{
                    fontSize: 13, padding: '6px 10px', borderRadius: 7,
                    background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)',
                    outline: 'none',
                  }}
                />
              </Field>
              <button
                onClick={handleSaveSchedule}
                disabled={savingSchedule || !scheduleDateInput}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 7,
                  background: 'var(--pz-teal)', color: 'var(--pz-on-accent)',
                  border: 'none', cursor: savingSchedule || !scheduleDateInput ? 'default' : 'pointer',
                  opacity: savingSchedule || !scheduleDateInput ? 0.6 : 1,
                }}
              >
                {savingSchedule ? 'Saving…' : 'Schedule'}
              </button>
            </div>
          )}

          <div style={{
            marginTop: 12, fontSize: 12, color: 'var(--pz-muted)',
            background: 'var(--pz-surface)', border: '1px solid var(--pz-border)',
            borderRadius: 6, padding: '8px 12px',
          }}>
            Attendees will see this session as live at the scheduled time. Chat and Q&A will be active during the broadcast.
          </div>
        </div>
      )}
    </section>
  )
}
