'use client'
import { PortalShell } from '@/components/portal/PortalShell'
import { useState, useTransition, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download, Users, Package, BarChart3, QrCode, FileText, Info } from 'lucide-react'
import {
  exportSponsorLeads,
  updateLeadQuality,
  updateLeadNote,
  updateSponsorBooth,
} from '@/lib/sponsors/portal-actions'
import { Field } from '@/components/ui/Field'
import type { SponsorLead } from '@/lib/sponsors/portal-actions'
import { SPONSOR_TIER_COLORS, SPONSOR_QUALITY_STYLE } from '@/lib/ui/category-colors'

interface Props {
  event: { id: string; title: string; starts_at: string; ends_at: string; registration_count: number | null }
  sponsor: { id: string; name: string; tier: string; logo_url: string | null; website_url: string | null; description: string | null; contact_email: string | null; materials: any[] }
  leads: SponsorLead[]
  eventSlug: string
  token: string
}

const TIER_COLOR = SPONSOR_TIER_COLORS
const QUALITY_STYLE = SPONSOR_QUALITY_STYLE
const QUALITY_CYCLE: Record<string, 'hot' | 'warm' | 'cold'> = { hot: 'warm', warm: 'cold', cold: 'hot' }

export default function SponsorPortalClient({ event, sponsor, leads: initLeads, eventSlug, token }: Props) {
  const [tab, setTab] = useState<'overview' | 'leads' | 'analytics' | 'info' | 'report'>('overview')
  const [leads, setLeads] = useState<SponsorLead[]>(initLeads)
  const [isLinkedUser, setIsLinkedUser] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email && sponsor.contact_email &&
          user.email.toLowerCase() === sponsor.contact_email.toLowerCase()) {
        setIsLinkedUser(true)
      }
    })
  }, [sponsor.contact_email])
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [scanCode, setScanCode] = useState('')
  const [scanNote, setScanNote] = useState('')
  const [scanResult, setScanResult] = useState<{ ok?: boolean; attendee_name?: string; error?: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [, startTransition] = useTransition()

  // Info tab state
  const [description, setDescription] = useState(sponsor.description ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(sponsor.website_url ?? '')
  const [logoUrl, setLogoUrl] = useState(sponsor.logo_url ?? '')
  const [infoSaving, setInfoSaving] = useState(false)
  const [infoSaved, setInfoSaved] = useState(false)

  async function handleExport() {
    setExporting(true)
    setExportNote(null)
    const result = await exportSponsorLeads(eventSlug, token)
    if (result.csv) {
      const blob = new Blob([result.csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${eventSlug}-leads.csv`
      a.click()
      URL.revokeObjectURL(url)
      const rowCount = Math.max(0, result.csv.split('\n').filter(l => l.trim().length > 0).length - 1)
      setExportNote(rowCount === 0
        ? 'No leads yet — exported an empty template.'
        : `Exported ${rowCount} lead${rowCount === 1 ? '' : 's'}.`)
      setTimeout(() => setExportNote(null), 4000)
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

  function handleNoteBlur(leadId: string, note: string) {
    startTransition(async () => {
      await updateLeadNote(token, leadId, note)
    })
  }

  async function handleSaveInfo() {
    setInfoSaving(true)
    setInfoSaved(false)
    await updateSponsorBooth(token, {
      description: description || undefined,
      website_url: websiteUrl || undefined,
      logo_url: logoUrl || undefined,
    })
    setInfoSaving(false)
    setInfoSaved(true)
    setTimeout(() => setInfoSaved(false), 3000)
  }

  const tierColor = TIER_COLOR[sponsor.tier] ?? '#6B7280'
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const hotCount = leads.filter(l => l.quality === 'hot').length
  const warmCount = leads.filter(l => l.quality === 'warm').length
  const coldCount = leads.filter(l => l.quality === 'cold').length
  const companiesReached = new Set(leads.map(l => l.company).filter(Boolean)).size

  const tabStyle = (active: boolean) => ({
    padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    background: active ? 'var(--pz-teal)' : 'transparent',
    color: active ? 'var(--pz-on-accent)' : 'var(--pz-muted)',
  })

  const inputStyle = {
    width: '100%',
    background: 'var(--pz-bg)',
    border: '1px solid var(--pz-border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--pz-text)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  return (
    <PortalShell
      eventName={event.title}
      portalLabel="Sponsor Portal"
      entityName={sponsor.name}
      entityDetail={`${sponsor.tier.charAt(0).toUpperCase() + sponsor.tier.slice(1)} Sponsor`}
      entityLogoUrl={sponsor.logo_url ?? undefined}
      exitHref={isLinkedUser ? '/dashboard' : undefined}
    >
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--pz-surface)', borderRadius: 10, padding: 4, width: 'fit-content', border: '1px solid var(--pz-border)', flexWrap: 'wrap' }}>
          <button style={tabStyle(tab === 'overview')} onClick={() => setTab('overview')}><Package size={13} style={{ display: 'inline', marginRight: 4 }} />Overview</button>
          <button style={tabStyle(tab === 'leads')} onClick={() => setTab('leads')}><Users size={13} style={{ display: 'inline', marginRight: 4 }} />Leads ({leads.length})</button>
          <button style={tabStyle(tab === 'analytics')} onClick={() => setTab('analytics')}><BarChart3 size={13} style={{ display: 'inline', marginRight: 4 }} />Analytics</button>
          <button style={tabStyle(tab === 'report')} onClick={() => setTab('report')}><FileText size={13} style={{ display: 'inline', marginRight: 4 }} />Report</button>
          <button style={tabStyle(tab === 'info')} onClick={() => setTab('info')}><Info size={13} style={{ display: 'inline', marginRight: 4 }} />Edit Info</button>
        </div>

        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border)' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 16 }}>Sponsor Information</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                {sponsor.website_url && (
                  <div><p style={{ fontSize: 11, color: 'var(--pz-muted)', marginBottom: 2 }}>Website</p><a href={sponsor.website_url} target="_blank" rel="noreferrer" style={{ color: 'var(--pz-teal-ink)', fontSize: 14 }}>{sponsor.website_url}</a></div>
                )}
                {sponsor.contact_email && (
                  <div><p style={{ fontSize: 11, color: 'var(--pz-muted)', marginBottom: 2 }}>Contact</p><p style={{ fontSize: 14 }}>{sponsor.contact_email}</p></div>
                )}
              </div>
              {sponsor.description && <p style={{ marginTop: 12, fontSize: 14, color: 'var(--pz-text)', lineHeight: 1.6 }}>{sponsor.description}</p>}
            </div>
            {sponsor.materials.length > 0 && (
              <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border)' }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 16 }}>Materials</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(sponsor.materials as any[]).map((m, i) => (
                    <a key={i} href={m.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--pz-teal-ink)', textDecoration: 'none' }}>
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
            {/* Analytics summary */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              {[
                { label: 'Hot', count: hotCount, color: 'var(--pz-error)' },
                { label: 'Warm', count: warmCount, color: 'var(--pz-warning-fill)' },
                { label: 'Cold', count: coldCount, color: QUALITY_STYLE.cold.color },
                { label: 'Total', count: leads.length, color: 'var(--pz-teal-ink)' },
              ].map(({ label, count, color }) => (
                <div key={label} style={{ flex: 1, textAlign: 'center', padding: '0.75rem 0.5rem',
                                           background: 'var(--pz-surface)', borderRadius: 10,
                                           border: `1px solid ${color}44` }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{count}</p>
                  <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Scanner */}
            <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <QrCode size={16} style={{ color: 'var(--pz-teal)' }} />
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text)' }}>Scan Attendee Badge</h2>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  value={scanCode}
                  onChange={e => setScanCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScan()}
                  placeholder="Scan or type QR code…"
                  style={{ flex: 1, background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--pz-text)', outline: 'none' }}
                />
                <button
                  onClick={handleScan}
                  disabled={scanning || !scanCode.trim()}
                  style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: scanning || !scanCode.trim() ? 0.5 : 1 }}
                >
                  {scanning ? 'Scanning…' : 'Capture'}
                </button>
              </div>
              <input
                type="text"
                value={scanNote}
                onChange={e => setScanNote(e.target.value)}
                placeholder="Add a note (optional)"
                style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'var(--pz-muted)', outline: 'none', boxSizing: 'border-box' }}
              />
              {scanResult && (
                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: scanResult.ok ? 'var(--pz-teal-bg)' : 'var(--pz-error-bg)', border: `1px solid ${scanResult.ok ? 'var(--pz-teal)' : 'var(--pz-error)'}` }}>
                  {scanResult.ok
                    ? <p style={{ fontSize: 13, color: 'var(--pz-teal-ink)', fontWeight: 600 }}>Captured: {scanResult.attendee_name}</p>
                    : <p style={{ fontSize: 13, color: 'var(--pz-error)' }}>{scanResult.error}</p>
                  }
                </div>
              )}
            </div>

            {/* Lead list */}
            <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700 }}>Captured Leads ({leads.length})</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {exportNote && (
                    <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>{exportNote}</span>
                  )}
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: exporting ? 0.6 : 1 }}
                  >
                    <Download size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
                  </button>
                </div>
              </div>
              {leads.length === 0 ? (
                <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>No leads captured yet. Scan a badge above to start.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {leads.map(lead => {
                    const q = QUALITY_STYLE[lead.quality] ?? QUALITY_STYLE.warm
                    return (
                      <div key={lead.id} style={{ padding: '10px 12px', background: 'var(--pz-surface)', borderRadius: 8, border: '1px solid var(--pz-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, fontSize: 14 }}>{lead.attendee_name ?? '—'}</p>
                            <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>{lead.attendee_email ?? ''}{lead.company ? ` · ${lead.company}` : ''}{lead.job_title ? ` · ${lead.job_title}` : ''}</p>
                          </div>
                          <button
                            onClick={() => handleCycleQuality(lead.id, lead.quality)}
                            style={{ background: q.bg, color: q.color, border: `1px solid ${q.color}44`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                          >
                            {q.label}
                          </button>
                        </div>
                        <textarea
                          defaultValue={lead.note ?? ''}
                          onBlur={e => handleNoteBlur(lead.id, e.target.value)}
                          placeholder="Add a note..."
                          rows={2}
                          style={{ width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6,
                                   border: '1px solid var(--pz-border)', background: 'var(--pz-surface)',
                                   color: 'var(--pz-text)', marginTop: 6, resize: 'none', boxSizing: 'border-box', outline: 'none' }}
                        />
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
              { label: 'Hot Leads', value: hotCount },
              { label: 'Tier', value: sponsor.tier.charAt(0).toUpperCase() + sponsor.tier.slice(1) },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border)', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--pz-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>{stat.label}</p>
                <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--pz-text)' }}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'report' && (
          <div style={{ padding: '0.5rem 0' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>
              Sponsorship Summary
            </h2>
            <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: 20 }}>
              {event.title}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Total leads captured', value: leads.length },
                { label: 'Hot leads', value: hotCount },
                { label: 'Companies reached', value: companiesReached },
                { label: 'Event attendees', value: event.registration_count ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--pz-surface)', borderRadius: 10,
                                           padding: '1rem', border: '1px solid var(--pz-border)' }}>
                  <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--pz-teal-ink)', margin: '0 0 4px' }}>
                    {value}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>{label}</p>
                </div>
              ))}
            </div>

            {companiesReached > 0 && (
              <div style={{ background: 'var(--pz-surface)', borderRadius: 10, padding: '1rem', border: '1px solid var(--pz-border)', marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)',
                             marginBottom: 10, textTransform: 'uppercase' as const }}>
                  Companies Reached
                </h3>
                {Array.from(new Set(leads.map(l => l.company).filter(Boolean))).slice(0, 10).map(company => {
                  const count = leads.filter(l => l.company === company).length
                  return (
                    <div key={company as string} style={{ display: 'flex', justifyContent: 'space-between',
                                                          padding: '8px 0', borderBottom: '1px solid var(--pz-border)' }}>
                      <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>{company as string}</span>
                      <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                        {count} contact{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              onClick={() => handleExport()}
              style={{ marginTop: 4, width: '100%', padding: '0.75rem', borderRadius: 10,
                       border: '1px solid var(--pz-teal)', background: 'transparent',
                       color: 'var(--pz-teal-ink)', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              {exporting ? 'Exporting…' : 'Export leads as CSV'}
            </button>
            {exportNote && (
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--pz-muted)', textAlign: 'center' }}>{exportNote}</p>
            )}
          </div>
        )}

        {tab === 'info' && (
          <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--pz-border)', maxWidth: 560 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 16 }}>Edit Booth Info</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Company description" htmlFor="sp-description">
                <textarea
                  id="sp-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Tell attendees about your company…"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </Field>
              <Field label="Website URL" htmlFor="sp-website">
                <input
                  id="sp-website"
                  type="url"
                  value={websiteUrl}
                  onChange={e => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={inputStyle}
                />
              </Field>
              <Field label="Logo URL" htmlFor="sp-logo">
                <input
                  id="sp-logo"
                  type="url"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  style={inputStyle}
                />
              </Field>
              <button
                onClick={handleSaveInfo}
                disabled={infoSaving}
                style={{ padding: '0.75rem', borderRadius: 8, border: 'none',
                         background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', fontWeight: 700,
                         fontSize: 14, cursor: infoSaving ? 'default' : 'pointer',
                         opacity: infoSaving ? 0.7 : 1, marginTop: 4 }}
              >
                {infoSaving ? 'Saving…' : infoSaved ? '✓ Saved' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  )
}
