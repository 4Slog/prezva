'use client'

import { useState } from 'react'

interface Props {
  eventTitle: string
  audienceTag: string
  ghlContactsUrl: string
  lifecycleTags: {
    confirmed: string
    checkedIn: string
  }
}

export function AnnouncementsClient({ eventTitle, audienceTag, ghlContactsUrl, lifecycleTags }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(audienceTag)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
        Announcements for {eventTitle} are sent through GoHighLevel.
      </p>

      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
      >
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--pz-muted)' }}>Audience tag</p>
          <div className="flex items-center gap-2">
            <code
              className="text-sm px-2 py-1 rounded"
              style={{ background: 'var(--pz-bg)', color: 'var(--pz-text)', fontFamily: 'monospace' }}
            >
              {audienceTag}
            </code>
            <button
              onClick={handleCopy}
              className="text-xs px-2 py-1 rounded border"
              style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-muted)' }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <a
          href={ghlContactsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
        >
          Open Contacts in GoHighLevel →
        </a>

        <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
          In Contacts, filter by this tag, then use Bulk Actions to send an email or SMS to this audience.
        </p>
      </div>

      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
      >
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--pz-muted)' }}>
          Lifecycle tags Prezva applies automatically
        </p>
        <ul className="text-sm space-y-1">
          <li>
            <code style={{ fontFamily: 'monospace', color: 'var(--pz-text)' }}>{lifecycleTags.confirmed}</code>
            <span style={{ color: 'var(--pz-muted)' }}> — registration confirmed</span>
          </li>
          <li>
            <code style={{ fontFamily: 'monospace', color: 'var(--pz-text)' }}>{lifecycleTags.checkedIn}</code>
            <span style={{ color: 'var(--pz-muted)' }}> — checked in at the event</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
