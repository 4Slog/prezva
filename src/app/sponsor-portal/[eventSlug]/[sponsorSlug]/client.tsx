'use client'
import { useState, useTransition } from 'react'
import { Download, Users, Package, BarChart3, QrCode } from 'lucide-react'
import { exportSponsorLeads, updateLeadQuality } from '@/lib/sponsors/portal-actions'
import type { SponsorLead } from '@/lib/sponsors/portal-actions'

interface Props {
  event: { id: string; title: string; starts_at: string; ends_at: string }
  sponsor: { id: string; name: string; tier: string; logo_url: string | null; website_url: string | null; description: string | null; contact_email: string | null; materials: any[] }
  leads: SponsorLead[]
  eventSlug: string
  token: string
}

const TIER_COLOR: Record<string, string> = { title: '#7c3aed', gold: '#D97706', silver: '#6B7280', bronze: '#92400E' }
const QUALITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  hot:  { bg: '#ef444422', color: '#ef4444', label: 'Hot' },
  warm: { bg: '#f59e0b22', color: '#f59e0b', label: 'Warm' },
  cold: { bg: '#3b82f622', color: '#3b82f6', label: 'Cold' },
}
const QUALITY_CYCLE: Record<string, 'hot' | 'warm' | 'cold'> = { hot: 'warm', warm: 'cold', cold: 'hot' }

export default function SponsorPortalClient({ event, sponsor, leads: initLeads, eventSlug, token }: Props) {
  const [tab, setTab] = useState<'overview' | 'leads' | 'analytics'>('overview')
  const [leads, setLeads] = useState<SponsorLead[]>(initLeads)
  const [exporting, setExporting] = useState(false)
  const [scanCode, setScanCode] = useState('')
  const [scanNote, setScanNote] = useState('')
  const [scanResult, setScanResult] = useState<{ ok?: boolean; attendee_name?: string; error?: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [, startTransition] = useTransition()

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

  async function handleScan() {
    if (!scanCode.trim()) return
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch(`/api/sponsor-portal/${token}/scan-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_code: scanCode.trim(), note: scanNote || undefined }),
      })
      const json = await res.json()
      setScanResult(json)
      if (json.ok) {
        setScanCode('')
        setScanNote('')
        const freshLead: SponsorLead = {
          id: crypto.randomUUID(),
          attendee_name: json.attendee_name ?? null,
          attendee_email: null,
          company: json.company ?? null,
          job_title: json.job_title ?? null,
          note: scanNote || null,
          quality: 'warm',
          scanned_by_contact_name: null,
          created_at: new Date().toISOString(),
        }
        setLeads(prev => [freshLead, ...prev])
      }
    } finally {
      setScanning(false)
    }
  }

  function handleCycleQuality(leadId: string, current: string) {
    const next = QUALITY_CYCLE[current as keyof typeof QUALITY_CYCLE] ?? 'warm'
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, quality: next } : l))
    startTransition(async () => {
      await updateLeadQuality(token, leadId, next)
    })
  }

  const tierColor = TIER_COLOR[sponsor.tier] ?? '#6B7280'
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: active ? 'var(--color-teal, #00BFA6)' : 'transparent',
    color: active ? '#0D1B2A' : 'var(--pz-muted, #94A3B8)',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg, #0D1B2A)', fontFamily: 'sans-serif', color: 'var(--pz-text, #F0F4F8)' }}>
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
            <div>{leads.length} leads captured</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--pz-surface, #112240)', borderRadius: 10, padding: 4, width: 'fit-content', border: '1px solid var(--pz-border, #1E3A5F)' }}>
          <button style={tabStyle(tab === 'overview')} onClick={() => setTab('overview')}><Package size={13} style={{ display: 'inline', marginRight: 6 }} />Overview</button>
          <button style={tabStyle(tab === 'leads')} onClick={() => setTab('leads')}><Users size={13} style={{ display: 'inline', marginRight: 6 }} />Leads ({leads.length})</button>
          <button style={tabStyle(tab === 'analytics')} onClick={() => setTab('analytics')}><BarChart3 size={13} style={{ display: 'inline', marginRight: 6 }} />Analytics</button>
        </div>

        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'var(--pz-surface, #112240)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border, #1E3A5F)' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text, #F0F4F8)', marginBottom: 16 }}>Sponsor Information</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                {sponsor.website_url && (
                  <div><p style={{ fontSize: 11, color: 'var(--pz-muted, #94A3B8)', marginBottom: 2 }}>Website</p><a href={sponsor.website_url} target="_blank" rel="noreferrer" style={{ color: '#00BFA6', fontSize: 14 }}>{sponsor.website_url}</a></div>
                )}
                {sponsor.contact_email && (
                  <div><p style={{ fontSize: 11, color: 'var(--pz-muted, #94A3B8)', marginBottom: 2 }}>Contact</p><p style={{ fontSize: 14 }}>{sponsor.contact_email}</p></div>
                )}
              </div>
              {sponsor.description && <p style={{ marginTop: 12, fontSize: 14, color: 'var(--pz-text, #F0F4F8)', lineHeight: 1.6 }}>{sponsor.description}</p>}
            </div>
            {sponsor.materials.length > 0 && (
              <div style={{ background: 'var(--pz-surface, #112240)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border, #1E3A5F)' }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text, #F0F4F8)', marginBottom: 16 }}>Materials</h2>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Scanner */}
            <div style={{ background: 'var(--pz-surface, #112240)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border, #1E3A5F)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <QrCode size={16} style={{ color: '#00BFA6' }} />
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text, #F0F4F8)' }}>Scan Attendee Badge</h2>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  value={scanCode}
                  onChange={e => setScanCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScan()}
                  placeholder="Scan or type QR code…"
                  style={{ flex: 1, background: '#0D1B2A', border: '1px solid #1E3A5F', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#F0F4F8', outline: 'none' }}
                />
                <button
                  onClick={handleScan}
                  disabled={scanning || !scanCode.trim()}
                  style={{ background: '#00BFA6', color: '#0D1B2A', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: scanning || !scanCode.trim() ? 0.5 : 1 }}
                >
                  {scanning ? 'Scanning…' : 'Capture'}
                </button>
              </div>
              <input
                type="text"
                value={scanNote}
                onChange={e => setScanNote(e.target.value)}
                placeholder="Add a note (optional)"
                style={{ width: '100%', background: '#0D1B2A', border: '1px solid #1E3A5F', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#94A3B8', outline: 'none', boxSizing: 'border-box' }}
              />
              {scanResult && (
                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: scanResult.ok ? '#00BFA622' : '#ef444422', border: `1px solid ${scanResult.ok ? '#00BFA6' : '#ef4444'}` }}>
                  {scanResult.ok
                    ? <p style={{ fontSize: 13, color: '#00BFA6', fontWeight: 600 }}>Captured: {scanResult.attendee_name}</p>
                    : <p style={{ fontSize: 13, color: '#ef4444' }}>{scanResult.error}</p>
                  }
                </div>
              )}
            </div>

            {/* Lead list */}
            <div style={{ background: 'var(--pz-surface, #112240)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border, #1E3A5F)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700 }}>Captured Leads ({leads.length})</h2>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#00BFA6', color: '#0D1B2A', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: exporting ? 0.6 : 1 }}
                >
                  <Download size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
              </div>
              {leads.length === 0 ? (
                <p style={{ color: '#94A3B8', fontSize: 14 }}>No leads captured yet. Scan a badge above to start.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {leads.map(lead => {
                    const q = QUALITY_STYLE[lead.quality] ?? QUALITY_STYLE.warm
                    return (
                      <div key={lead.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '10px 12px', background: '#0D1B2A', borderRadius: 8, border: '1px solid #1E3A5F', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 14 }}>{lead.attendee_name ?? '—'}</p>
                          <p style={{ fontSize: 12, color: '#94A3B8' }}>{lead.attendee_email ?? ''}{lead.company ? ` · ${lead.company}` : ''}{lead.job_title ? ` · ${lead.job_title}` : ''}</p>
                          {lead.note && <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{lead.note}</p>}
                        </div>
                        <button
                          onClick={() => handleCycleQuality(lead.id, lead.quality)}
                          style={{ background: q.bg, color: q.color, border: `1px solid ${q.color}44`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {q.label}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'analytics' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {[
              { label: 'Total Leads', value: leads.length },
              { label: 'Hot Leads', value: leads.filter(l => l.quality === 'hot').length },
              { label: 'Tier', value: sponsor.tier.charAt(0).toUpperCase() + sponsor.tier.slice(1) },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--pz-surface, #112240)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border, #1E3A5F)', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>{stat.label}</p>
                <p style={{ fontSize: 32, fontWeight: 700, color: '#F0F4F8' }}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
