'use client'

import { SOCIAL_BRAND_COLORS } from '@/lib/ui/category-colors'

type Props = {
  eventTitle: string
  eventUrl: string
}

export function SocialShareButtons({ eventTitle, eventUrl }: Props) {
  const shareText = `I just registered for ${eventTitle}! Join me → ${eventUrl}`
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(eventUrl)}`
  const twitterUrl  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`

  return (
    <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--pz-surface)',
                  borderRadius: 12, border: '1px solid var(--pz-border)' }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 10px' }}>
        Share that you&apos;re attending
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href={linkedInUrl} target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                   padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
                   background: SOCIAL_BRAND_COLORS.linkedin, color: 'var(--pz-surface)', textDecoration: 'none' }}>
          Share on LinkedIn
        </a>
        <a href={twitterUrl} target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                   padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
                   background: SOCIAL_BRAND_COLORS.x, color: 'var(--pz-surface)', textDecoration: 'none' }}>
          Share on X
        </a>
        <button
          onClick={() => { navigator.clipboard.writeText(eventUrl) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                   padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
                   border: '1px solid var(--pz-border)', background: 'transparent',
                   color: 'var(--pz-text)', cursor: 'pointer' }}>
          Copy link
        </button>
      </div>
    </div>
  )
}
