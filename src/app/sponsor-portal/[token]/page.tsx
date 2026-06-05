import { getSponsorPortalDataByToken, getSponsorByContactToken } from '@/lib/sponsors/portal-actions'
import SponsorPortalClient from './client'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ contact?: string }>
}

export default async function SponsorPortalPage({ params, searchParams }: Props) {
  const { token } = await params
  const { contact } = await searchParams

  let resolvedToken = token
  if (contact) {
    const row = await getSponsorByContactToken(contact)
    if (row) {
      resolvedToken = (row as any).event_sponsors?.portal_access_token ?? token
    }
  }

  const result = await getSponsorPortalDataByToken(resolvedToken)

  if ('error' in result) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Access Denied</h1>
          <p style={{ color: 'var(--pz-muted)', marginTop: 8 }}>{result.error}</p>
        </div>
      </div>
    )
  }

  return (
    <SponsorPortalClient
      event={result.event}
      sponsor={result.sponsor}
      leads={result.leads}
      eventSlug={result.event.slug}
      token={resolvedToken}
    />
  )
}
