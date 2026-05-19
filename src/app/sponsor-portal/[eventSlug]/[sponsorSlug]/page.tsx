import { getSponsorPortalData, getSponsorByContactToken } from '@/lib/sponsors/portal-actions'
import SponsorPortalClient from './client'

type Props = {
  params: Promise<{ eventSlug: string; sponsorSlug: string }>
  searchParams: Promise<{ token?: string; contact?: string }>
}

export default async function SponsorPortalPage({ params, searchParams }: Props) {
  const { eventSlug, sponsorSlug } = await params
  const { token, contact } = await searchParams

  let resolvedToken = token
  if (!resolvedToken && contact) {
    const row = await getSponsorByContactToken(contact)
    if (row) {
      resolvedToken = (row as any).event_sponsors?.portal_access_token
    }
  }

  if (!resolvedToken) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Invalid Portal Link</h1>
          <p style={{ color: '#6B7280', marginTop: 8 }}>This link is missing an access token. Please use the link provided by the event organizer.</p>
        </div>
      </div>
    )
  }

  const result = await getSponsorPortalData(eventSlug, sponsorSlug, resolvedToken)

  if ('error' in result) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Access Denied</h1>
          <p style={{ color: '#6B7280', marginTop: 8 }}>{result.error}</p>
        </div>
      </div>
    )
  }

  return <SponsorPortalClient event={result.event} sponsor={result.sponsor} leads={result.leads} eventSlug={eventSlug} token={resolvedToken} />
}
