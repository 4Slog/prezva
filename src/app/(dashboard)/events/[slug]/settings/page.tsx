import { notFound } from 'next/navigation'
import { getEventBySlug, updateEvent, deleteEvent, updateEventDiscoverable, updateEventTagsAndCategory } from '@/lib/events/actions'
import Link from 'next/link'
import { EventSettingsClient } from './settings-client'
import { listOrgCertificateTemplates } from '@/lib/certificates/actions'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

type Props = { params: Promise<{ slug: string }> }

export default async function EventSettingsPage({ params }: Props) {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) notFound()

  const supabase = await createClient()
  const user = await requireUser()

  // Determine if this user is staff-only (read-only view) or owner/admin (can edit)
  const { data: memberRow } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!memberRow) notFound()
  const isStaff = memberRow.role === 'staff'

  const { data: integrationRows } = await supabase
    .from('org_integrations')
    .select('provider, status')
    .eq('org_id', (event as any).org_id)
    .in('provider', ['outlook', 'google_drive', 'sharepoint'])
  const integrationMap: Record<string, string> = {}
  for (const row of integrationRows ?? []) integrationMap[row.provider] = row.status

  const inputCls = `w-full rounded-lg border border-[#1E3A5F] bg-[#112240] px-3 py-2 text-sm text-[#F0F4F8] focus:border-[#2DD4BF] focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]${isStaff ? ' opacity-70 cursor-not-allowed' : ''}`
  const labelCls = 'mb-1 block text-sm font-medium text-[#94A3B8]'

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/events/${slug}`} className="text-[#64748B] hover:text-[#94A3B8] text-sm">
          ← {event.title}
        </Link>
        <span className="text-[#1E3A5F]">/</span>
        <span className="text-sm text-[#F0F4F8]">Settings</span>
      </div>

      <h1 className="text-xl font-bold text-[#F0F4F8] mb-6">Event settings</h1>

      {isStaff && (
        <div className="mb-6 rounded-lg bg-[#112240] border border-[#1E3A5F] px-4 py-3 text-sm text-[#94A3B8]">
          You&apos;re viewing settings in read-only mode. Contact an admin to make changes.
        </div>
      )}

      {/* General */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">General</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            await updateEvent(event.id, fd)
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className={labelCls}>Event name</label>
            <input name="title" defaultValue={event.title} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea name="description" rows={3} defaultValue={event.description ?? ''} className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start</label>
              <input
                type="datetime-local"
                name="start_at"
                defaultValue={event.start_at.slice(0, 16)}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>End</label>
              <input
                type="datetime-local"
                name="end_at"
                defaultValue={event.end_at.slice(0, 16)}
                required
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Timezone</label>
            <select name="timezone" defaultValue={event.timezone} className={inputCls}>
              <option value="America/New_York">Eastern (ET)</option>
              <option value="America/Chicago">Central (CT)</option>
              <option value="America/Denver">Mountain (MT)</option>
              <option value="America/Los_Angeles">Pacific (PT)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          {!isStaff && (
            <button
              type="submit"
              className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              Save changes
            </button>
          )}
        </form>
      </section>

      {/* Venue */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Venue</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            await updateEvent(event.id, fd)
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className={labelCls}>Venue name</label>
            <input name="venue_name" defaultValue={event.venue_name ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Address</label>
            <input name="venue_address" defaultValue={event.venue_address ?? ''} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>City</label>
              <input name="venue_city" defaultValue={event.venue_city ?? ''} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input name="venue_state" defaultValue={event.venue_state ?? ''} className={inputCls} />
            </div>
          </div>
          {!isStaff && (
            <button
              type="submit"
              className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              Save venue
            </button>
          )}
        </form>
      </section>

      {/* Discovery */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Discovery</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            const isDiscoverable = fd.get('is_discoverable') === 'true'
            await updateEventDiscoverable(event.id, isDiscoverable)
          }}
          className="flex flex-col gap-4"
        >
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: isStaff ? 'default' : 'pointer' }}>
            <input
              type="checkbox"
              name="is_discoverable"
              value="true"
              defaultChecked={(event as any).is_discoverable ?? false}
              disabled={isStaff}
              style={{ marginTop: 2, accentColor: 'var(--pz-teal)', width: 16, height: 16 }}
            />
            <div>
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>
                List this event publicly on Prezva
              </p>
              <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '2px 0 0' }}>
                When enabled, this event appears in Prezva&apos;s public event discovery.
                Your event registration page is always publicly accessible via direct link regardless of this setting.
              </p>
            </div>
          </label>
          {!isStaff && (
            <button
              type="submit"
              className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              Save discovery
            </button>
          )}
        </form>

        {/* Category and tags */}
        <form
          action={async (fd: FormData) => {
            'use server'
            const category = fd.get('category') as string | null
            const tagsRaw = fd.get('tags') as string ?? ''
            const tags = tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
            await updateEventTagsAndCategory(event.id, category, tags)
          }}
          className="flex flex-col gap-4 mt-6 pt-6 border-t border-[#1E3A5F]"
        >
          <div>
            <label className={labelCls}>Category</label>
            <select name="category" defaultValue={(event as any).category ?? ''} disabled={isStaff} className={inputCls}>
              <option value="">Select a category</option>
              <option value="conference">Conference</option>
              <option value="workshop">Workshop</option>
              <option value="webinar">Webinar</option>
              <option value="gala">Gala / Awards</option>
              <option value="training">Training</option>
              <option value="networking">Networking</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Tags</label>
            <input
              name="tags"
              type="text"
              placeholder="e.g. technology, policy, nonprofit (comma-separated)"
              defaultValue={((event as any).tags ?? []).join(', ')}
              disabled={isStaff}
              className={inputCls}
            />
            <p style={{ fontSize: 11, color: 'var(--pz-muted)', marginTop: 4 }}>
              Tags help attendees find your event in search. Use 3–5 relevant keywords.
            </p>
          </div>
          {!isStaff && (
            <button
              type="submit"
              className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              Save category &amp; tags
            </button>
          )}
        </form>
      </section>

      {/* Registration settings */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Registration</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            await updateEvent(event.id, fd)
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className={labelCls}>Max capacity</label>
            <input name="capacity" type="number" min="1" defaultValue={event.capacity ?? ''} placeholder="Unlimited" className={inputCls} />
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                name="waitlist_enabled"
                type="checkbox"
                value="true"
                defaultChecked={event.waitlist_enabled}
                className="rounded"
              />
              <span className="text-sm text-[#94A3B8]">Enable waitlist when at capacity</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                name="require_approval"
                type="checkbox"
                value="true"
                defaultChecked={event.require_approval}
                className="rounded"
              />
              <span className="text-sm text-[#94A3B8]">Require approval for registrations</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                name="allow_public_attendee_list"
                type="checkbox"
                value="true"
                defaultChecked={event.allow_public_attendee_list}
                className="rounded"
              />
              <span className="text-sm text-[#94A3B8]">Show public attendee list</span>
            </label>
          </div>
          <div>
            <label className={labelCls}>Invite code (optional)</label>
            <input
              name="registration_invite_code"
              type="text"
              defaultValue={(event as any).registration_invite_code ?? ''}
              placeholder="e.g. CIVITAS2026 — leave blank for open registration"
              className={inputCls}
              maxLength={50}
            />
            <p className="text-xs text-[#64748B] mt-1">Attendees must enter this code to register.</p>
          </div>
          <div>
            <label className={labelCls}>Domain restriction (optional)</label>
            <input
              name="registration_domain_restrict"
              type="text"
              defaultValue={(event as any).registration_domain_restrict ?? ''}
              placeholder="e.g. acme.com — leave blank to allow any email"
              className={inputCls}
              maxLength={100}
            />
            <p className="text-xs text-[#64748B] mt-1">Only emails from this domain can register.</p>
          </div>
          {!isStaff && (
            <button
              type="submit"
              className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              Save settings
            </button>
          )}
        </form>
      </section>

      {/* Sprint 22: Certificate settings */}
      <CertificateSettingsSection event={event} inputCls={inputCls} labelCls={labelCls} />

      {/* T-119/T-120/T-121: Clone, Templates, Recurrence */}
      <EventSettingsClient
        eventId={(event as any).id}
        eventSlug={slug}
        orgId={(event as any).org_id}
        currentRecurrence={(event as any).recurrence ?? null}
        outlookConnected={integrationMap['outlook'] === 'connected'}
        driveConnected={integrationMap['google_drive'] === 'connected'}
        sharepointConnected={integrationMap['sharepoint'] === 'connected'}
      />

      {/* Danger zone */}

      {!isStaff && event.status !== 'live' && (
        <section className="rounded-lg border border-[var(--pz-error)]/30 bg-[var(--pz-error)]/5 p-6">
          <h2 className="text-sm font-semibold text-[var(--pz-error)] mb-2">Danger zone</h2>
          <p className="text-sm text-[#94A3B8] mb-4">
            Permanently delete this event and all its data. This cannot be undone.
          </p>
          <form
            action={async () => {
              'use server'
              await deleteEvent(event.id)
            }}
          >
            <button
              type="submit"
              className="rounded-lg border border-[var(--pz-error)]/40 px-4 py-2 text-sm font-medium text-[var(--pz-error)] hover:bg-[var(--pz-error)]/10 transition-colors"
            >
              Delete event
            </button>
          </form>
        </section>
      )}
    </div>
  )
}

async function CertificateSettingsSection({
  event,
  inputCls,
  labelCls,
}: {
  event: any
  inputCls: string
  labelCls: string
}) {
  const certTemplates = await listOrgCertificateTemplates(event.org_id)

  return (
    <section className="pz-card p-6 mb-6">
      <h2 className="text-sm font-semibold text-[#F0F4F8] mb-1">Certificates</h2>
      <p className="text-xs text-[#64748B] mb-4">Issue CE-credit certificates to attendees who meet attendance requirements.</p>
      <form
        action={async (fd: FormData) => {
          'use server'
          await updateEvent(event.id, fd)
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            name="certificate_enabled"
            type="checkbox"
            value="true"
            defaultChecked={event.certificate_enabled ?? false}
            className="rounded"
          />
          <span className="text-sm text-[#94A3B8]">Enable certificates for this event</span>
        </label>
        <div>
          <label className={labelCls}>Minimum session attendance %</label>
          <input
            name="certificate_min_session_attendance_pct"
            type="number"
            min="0"
            max="100"
            defaultValue={event.certificate_min_session_attendance_pct ?? 60}
            className={inputCls}
          />
        </div>
        {certTemplates.length > 0 && (
          <div>
            <label className={labelCls}>Certificate template</label>
            <select name="certificate_template_id" defaultValue={event.certificate_template_id ?? ''} className={inputCls}>
              <option value="">Use org default</option>
              {certTemplates.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>
              ))}
            </select>
          </div>
        )}
        {certTemplates.length === 0 && (
          <p className="text-xs text-[#64748B]">
            No certificate templates yet.{' '}
            <a href={`/orgs/${event.org_slug ?? event.org_id}/certificates`} className="text-[#2DD4BF]">Create one in org settings →</a>
          </p>
        )}
        <button
          type="submit"
          className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Save certificate settings
        </button>
      </form>
    </section>
  )
}
