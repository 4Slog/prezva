'use client'

import { useState } from 'react'
import { Link2, ExternalLink, Share2, Check } from 'lucide-react'

interface ShareButtonsProps {
  url: string
  title: string
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
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
    border: '1px solid var(--pz-border)',
    background: 'var(--pz-surface-2)',
    color: 'var(--pz-text)',
    textDecoration: 'none',
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
      <button style={btnStyle} onClick={copyLink}>
        {copied ? <><Check size={14} /> Copied!</> : <><Link2 size={14} /> Copy link</>}
      </button>
      <a href={twitterUrl} target="_blank" rel="noopener noreferrer" style={btnStyle}>
        <Share2 size={14} /> Share
      </a>
      <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" style={btnStyle}>
        <ExternalLink size={14} /> LinkedIn
      </a>
    </div>
  )
}
