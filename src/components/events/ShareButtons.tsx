'use client'

import { useState } from 'react'

interface ShareButtonsProps {
  url: string
  title: string
  calendarHref: string
}

export function ShareButtons({ url, title, calendarHref }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    textDecoration: 'none',
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
      <button style={btnStyle} onClick={copyLink}>
        {copied ? '✓ Copied!' : '🔗 Copy link'}
      </button>
      <a href={twitterUrl} target="_blank" rel="noopener noreferrer" style={btnStyle}>
        𝕏 Share
      </a>
      <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" style={btnStyle}>
        in Share
      </a>
      <a href={calendarHref} style={btnStyle}>
        📅 Add to Calendar
      </a>
    </div>
  )
}
