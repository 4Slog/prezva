'use client'
import { useState } from 'react'
import { Download, Users, Package, BarChart3 } from 'lucide-react'
import { exportSponsorLeads } from '@/lib/sponsors/portal-actions'

interface Lead { id: string; attendee_name: string; attendee_email: string; attendee_company: string | null; created_at: string }

interface Props {
  event: { id: string; title: string; starts_at: string; ends_at: string }
  sponsor: { id: string; name: string; tier: string; logo_url: string | null; website_url: string | null; description: string | null; contact_email: string | null; materials: any[] }
  leads: Lead[]
  eventSlug: string
  token: string
}

const TIER_COLOR: Record<string, string> = { title: '#7c3aed', gold: '#D97706', silver: '#6B7280', bronze: '#92400E' }

export default function SponsorPortalClient({ event, sponsor, leads, eventSlug, token }: Props) {
  const [tab, setTab] = useState<'overview' | 'leads' | 'analytics'>('overview')
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    const result = await exportSponsorLeads(eventSlug, token)
    if (result.csv) {
      const blob = new Blob([result.csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${eventSlug}-leads.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
  }

  const tierColor = TIER_COLOR[sponsor.tier] ?? '#6B7280'
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: active ? 'var(--color-teal, #00BFA6)' : 'transparent',
    color: active ? '#fff' : '#6B7280',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0D1B2A', color: '#fff', padding: '1.5rem 2rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {sponsor.logo_url && <img src={sponsor.logo_url} alt={sponsor.name} style={{ height: 48, width: 'auto', objectFit: 'contain', borderRadius: 6, background: '#fff', padding: 4 }} />}
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700 }}>{sponsor.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: tierColor, letterSpacing: 1 }}>{sponsor.tier} Sponsor</span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>· {event.title}</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#94A3B8' }}>
            <div>{fmtDate(event.starts_at)}</div>
            <div>{leads.length} registered attendees</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#E5E7EB', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          <button style={tabStyle(tab === 'overview')} onClick={() => setTab('overview')}><Package size={13} style={{ display: 'inline', marginRight: 6 }} />Overview</button>
          <button style={tabStyle(tab === 'leads')} onClick={() => setTab('leads')}><Users size={13} style={{ display: 'inline', marginRight: 6 }} />Leads ({leads.length})</button>
          <button style={tabStyle(tab === 'analytics')} onClick={() => setTab('analytics')}><BarChart3 size={13} style={{ display: 'inline', marginRight: 6 }} />Analytics</button>
        </div>

        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', border: '1px solid #E5E7EB' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 16 }}>Sponsor Information</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                {sponsor.website_url && (
                  <div><p style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>Website</p><a href={sponsor.website_url} target="_blank" rel="noreferrer" style={{ color: '#00BFA6', fontSize: 14 }}>{sponsor.website_url}</a></div>
                )}
                {sponsor.contact_email && (
                  <div><p style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>Contact</p><p style={{ fontSize: 14 }}>{sponsor.contact_email}</p></div>
                )}
              </div>
              {sponsor.description && <p style={{ marginTop: 12, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{sponsor.description}</p>}
            </div>
            {sponsor.materials.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', border: '1px solid #E5E7EB' }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 16 }}>Materials</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(sponsor.materials as any[]).map((m, i) => (
                    <a key={i} href={m.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#00BFA6', textDecoration: 'none' }}>
                      <Download size={14} /> {m.name ?? m.url}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'leads' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', border: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>Registered Attendees ({leads.length})</h2>
              <button onClick={handleExport} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#00BFA6', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: exporting ? 0.6 : 1 }}>
                <Download size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
            {leads.length === 0 ? (
              <p style={{ color: '#6B7280', fontSize: 14 }}>No confirmed registrations yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid #E5E7EB', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
                  <span>Name</span><span>Email</span><span>Company</span>
                </div>
                {leads.map(lead => (
                  <div key={lead.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #F3F4F6', fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{lead.attendee_name}</span>
                    <span style={{ color: '#6B7280' }}>{lead.attendee_email}</span>
                    <span style={{ color: '#6B7280' }}>{lead.attendee_company ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'analytics' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {[
              { label: 'Total Attendees', value: leads.length },
              { label: 'Companies', value: new Set(leads.map(l => l.attendee_company).filter(Boolean)).size },
              { label: 'Tier', value: sponsor.tier.charAt(0).toUpperCase() + sponsor.tier.slice(1) },
            ].map(stat => (
              <div key={stat.label} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', border: '1px solid #E5E7EB', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>{stat.label}</p>
                <p style={{ fontSize: 32, fontWeight: 700, color: '#0D1B2A' }}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
