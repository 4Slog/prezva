'use client'

import { useState } from 'react'

interface IntegrationRow {
  provider: string
  displayName: string
  statusKey: string
  badge: { label: string; bg: string; color: string }
  isConfigured: boolean
  isConnected: boolean
  lastSyncedAt: string | null
  hasVerifyMembership: boolean
}

interface IntegrationsClientProps {
  sections: { title: string; integrations: IntegrationRow[] }[]
  orgId: string
  orgSlug: string
  mailchimpLists: { id: string; name: string; memberCount: number }[]
  defaultMailchimpListId: string | null
}

function relativeTime(ts: string | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function IntegrationCard({ row, orgId, orgSlug, mailchimpLists, defaultMailchimpListId }: {
  row: IntegrationRow
  orgId: string
  orgSlug: string
  mailchimpLists: { id: string; name: string; memberCount: number }[]
  defaultMailchimpListId: string | null
}) {
  const [savingList, setSavingList] = useState(false)
  const [listId, setListId] = useState(defaultMailchimpListId ?? '')
  const [listSaved, setListSaved] = useState(false)

  async function saveMailchimpList() {
    setSavingList(true)
    await fetch(`/api/integrations/mailchimp/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, defaultListId: listId }),
    })
    setSavingList(false)
    setListSaved(true)
    setTimeout(() => setListSaved(false), 2000)
  }

  return (
    <div className="pz-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-[#F0F4F8]">{row.displayName}</p>
            {row.hasVerifyMembership && row.isConnected && (
              <span className="text-xs rounded-full px-2 py-0.5 bg-[#00BFA6]/20 text-[#00BFA6]">
                Membership verification active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: row.badge.bg, color: row.badge.color }}>
              {row.badge.label}
            </span>
            {row.isConnected && row.lastSyncedAt && (
              <span className="text-xs text-[#64748B]">Last sync: {relativeTime(row.lastSyncedAt)}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0 ml-3">
          {row.isConfigured && !row.isConnected && (
            <a
              href={`/api/integrations/${row.provider}/auth?org_id=${orgId}`}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              {row.statusKey === 'error' ? 'Reconnect' : 'Connect'}
            </a>
          )}
          {row.isConnected && (
            <form action={`/api/integrations/${row.provider}/disconnect`} method="POST">
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="returnTo" value={`/orgs/${orgSlug}/integrations`} />
              <button type="submit" className="rounded-lg border border-[#EF4444]/30 px-3 py-1.5 text-xs text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors">
                Disconnect
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Mailchimp list picker */}
      {row.provider === 'mailchimp' && row.isConnected && mailchimpLists.length > 0 && (
        <div className="mt-3 flex items-center gap-2 border-t border-[#1E3A5F] pt-3">
          <label className="text-xs text-[#94A3B8] shrink-0">Default audience:</label>
          <select
            value={listId}
            onChange={e => setListId(e.target.value)}
            className="flex-1 text-xs rounded-lg border border-[#1E3A5F] bg-[#112240] px-2 py-1 text-[#F0F4F8]"
          >
            <option value="">Select a list...</option>
            {mailchimpLists.map(l => (
              <option key={l.id} value={l.id}>{l.name} ({l.memberCount.toLocaleString()} members)</option>
            ))}
          </select>
          <button
            onClick={saveMailchimpList}
            disabled={savingList || !listId}
            className="shrink-0 rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            {listSaved ? 'Saved!' : savingList ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

export function IntegrationsClient({ sections, orgId, orgSlug, mailchimpLists, defaultMailchimpListId }: IntegrationsClientProps) {
  return (
    <div className="space-y-8">
      {sections.map(section => (
        <div key={section.title}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-3">{section.title}</h2>
          <div className="space-y-2">
            {section.integrations.map(row => (
              <IntegrationCard
                key={row.provider}
                row={row}
                orgId={orgId}
                orgSlug={orgSlug}
                mailchimpLists={mailchimpLists}
                defaultMailchimpListId={defaultMailchimpListId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
