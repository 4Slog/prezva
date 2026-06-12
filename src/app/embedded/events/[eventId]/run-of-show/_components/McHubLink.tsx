'use client'

import { useState } from 'react'

interface Props {
  url: string
}

export function McHubLink({ url }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCopy}
        className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        style={{
          background: 'var(--pz-teal)',
          color: 'var(--pz-on-accent, #fff)',
        }}
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium"
        style={{ color: 'var(--pz-teal)' }}
      >
        Open ↗
      </a>
    </div>
  )
}
