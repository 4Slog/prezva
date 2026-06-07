import { notFound } from 'next/navigation'
import { getEventBySlug, updateEvent, deleteEvent, updateEventDiscoverable, updateEventTagsAndCategory } from '@/lib/events/actions'
import Link from 'next/link'
import { EventSettingsClient } from './settings-client'
import { listOrgCertificateTemplates } from '@/lib/certificates/actions'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import { Field } from '@/components/ui/Field'

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
  const permSet = await getOrgPermissions((event as any).org_id, user.id)
  const isStaff = !permSet.has('*') && !permSet.has('event.manage')

  const { data: integrationRows } = await supabase
    .from('org_integrations')
    .select('provider, status')
    .eq('org_id', (event as any).org_id)
    .in('provider', ['outlook', 'google_drive', 'sharepoint'])
  const integrationMap: Record<string, string> = {}
  for (const row of integrationRows ?? []) integrationMap[row.provider] = row.status

  const inputCls = `w-full rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface)] px-3 py-2 text-sm text-[var(--pz-text)] focus:border-[var(--pz-teal)] focus:outline-none focus:ring-1 focus:ring-[var(--pz-teal)]${isStaff ? ' opacity-70 cursor-not-allowed' : ''}`

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/events/${slug}`} className="text-[var(--pz-muted)] hover:text-[var(--pz-muted)] text-sm">
          ← {event.title}
        </Link>
        <span className="text-[var(--pz-border)]">/</span>
        <span className="text-sm text-[var(--pz-text)]">Settings</span>
      </div>

      <h1 className="text-xl font-bold text-[var(--pz-text)] mb-6">Event settings</h1>

      {isStaff && (
        <div className="mb-6 rounded-lg bg-[var(--pz-surface)] border border-[var(--pz-border)] px-4 py-3 text-sm text-[var(--pz-muted)]">
          You&apos;re viewing settings in read-only mode. Contact an admin to make changes.
        </div>
      )}

      {/* General */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-4">General</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            await updateEvent(event.id, fd)
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Event name" htmlFor="cfg-title" required>
            <input id="cfg-title" name="title" defaultValue={event.title} required className={inputCls} />
          </Field>
          <Field label="Description" htmlFor="cfg-desc">
            <textarea id="cfg-desc" name="description" rows={3} defaultValue={event.description ?? ''} className={`${inputCls} resize-none`} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start" htmlFor="cfg-start" required>
              <input
                id="cfg-start"
                type="datetime-local"
                name="start_at"
                defaultValue={event.start_at.slice(0, 16)}
                required
                className={inputCls}
              />
            </Field>
            <Field label="End" htmlFor="cfg-end" required>
              <input
                id="cfg-end"
                type="datetime-local"
                name="end_at"
                defaultValue={event.end_at.slice(0, 16)}
                required
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Timezone" htmlFor="cfg-tz">
            <select id="cfg-tz" name="timezone" defaultValue={event.timezone} className={inputCls}>
              <option value="America/New_York">Eastern (ET)</option>
              <option value="America/Chicago">Central (CT)</option>
              <option value="America/Denver">Mountain (MT)</option>
              <option value="America/Los_Angeles">Pacific (PT)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
          {!isStaff && (
            <button
              type="submit"
              className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              Save changes
            </button>
          )}
        </form>
      </section>

      {/* Venue */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-4">Venue</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            await updateEvent(event.id, fd)
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Venue name" htmlFor="cfg-venue">
            <input id="cfg-venue" name="venue_name" defaultValue={event.venue_name ?? ''} className={inputCls} />
          </Field>
          <Field label="Address" htmlFor="cfg-addr">
            <input id="cfg-addr" name="venue_address" defaultValue={event.venue_address ?? ''} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City" htmlFor="cfg-city">
              <input id="cfg-city" name="venue_city" defaultValue={event.venue_city ?? ''} className={inputCls} />
            </Field>
            <Field label="State" htmlFor="cfg-state">
              <input id="cfg-state" name="venue_state" defaultValue={event.venue_state ?? ''} className={inputCls} />
            </Field>
          </div>
          {!isStaff && (
            <button
              type="submit"
              className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              Save venue
            </button>
          )}
        </form>
      </section>

      {/* Discovery */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-4">Discovery</h2>
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
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
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
          className="flex flex-col gap-4 mt-6 pt-6 border-t border-[var(--pz-border)]"
        >
          <Field label="Category" htmlFor="cfg-cat">
            <select id="cfg-cat" name="category" defaultValue={(event as any).category ?? ''} disabled={isStaff} className={inputCls}>
              <option value="">Select a category</option>
              <option value="conference">Conference</option>
              <option value="workshop">Workshop</option>
              <option value="webinar">Webinar</option>
              <option value="gala">Gala / Awards</option>
              <option value="training">Training</option>
              <option value="networking">Networking</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Tags" htmlFor="cfg-tags" helper="Tags help attendees find your event in search. Use 3–5 relevant keywords.">
            <input
              id="cfg-tags"
              name="tags"
              type="text"
              placeholder="e.g. technology, policy, nonprofit (comma-separated)"
              defaultValue={((event as any).tags ?? []).join(', ')}
              disabled={isStaff}
              className={inputCls}
            />
          </Field>
          {!isStaff && (
            <button
              type="submit"
              className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              Save category &amp; tags
            </button>
          )}
        </form>
      </section>

      {/* Registration settings */}
      <section className="pz-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-4">Registration</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            await updateEvent(event.id, fd)
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Max capacity" htmlFor="cfg-cap">
            <input id="cfg-cap" name="capacity" type="number" min="1" defaultValue={event.capacity ?? ''} placeholder="Unlimited" className={inputCls} />
          </Field>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                name="waitlist_enabled"
                type="checkbox"
                value="true"
                defaultChecked={event.waitlist_enabled}
                className="rounded"
              />
              <span className="text-sm text-[var(--pz-muted)]">Enable waitlist when at capacity</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                name="require_approval"
                type="checkbox"
                value="true"
                defaultChecked={event.require_approval}
                className="rounded"
              />
              <span className="text-sm text-[var(--pz-muted)]">Require approval for registrations</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                name="allow_public_attendee_list"
                type="checkbox"
                value="true"
                defaultChecked={event.allow_public_attendee_list}
                className="rounded"
              />
              <span className="text-sm text-[var(--pz-muted)]">Show public attendee list</span>
            </label>
          </div>
          <Field label="Invite code (optional)" htmlFor="cfg-invite" helper="Attendees must enter this code to register.">
            <input
              id="cfg-invite"
              name="registration_invite_code"
              type="text"
              defaultValue={(event as any).registration_invite_code ?? ''}
              placeholder="e.g. CIVITAS2026 — leave blank for open registration"
              className={inputCls}
              maxLength={50}
            />
          </Field>
          <Field label="Domain restriction (optional)" htmlFor="cfg-domain" helper="Only emails from this domain can register.">
            <input
              id="cfg-domain"
              name="registration_domain_restrict"
              type="text"
              defaultValue={(event as any).registration_domain_restrict ?? ''}
              placeholder="e.g. acme.com — leave blank to allow any email"
              className={inputCls}
              maxLength={100}
            />
          </Field>
          {!isStaff && (
            <button
              type="submit"
              className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              Save settings
            </button>
          )}
        </form>
      </section>

      {/* Sprint 22: Certificate settings */}
      <CertificateSettingsSection event={event} inputCls={inputCls} />

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
          <p className="text-sm text-[var(--pz-muted)] mb-4">
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
}: {
  event: any
  inputCls: string
}) {
  const certTemplates = await listOrgCertificateTemplates(event.org_id)

  return (
    <section className="pz-card p-6 mb-6">
      <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-1">Certificates</h2>
      <p className="text-xs text-[var(--pz-muted)] mb-4">Issue CE-credit certificates to attendees who meet attendance requirements.</p>
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
          <span className="text-sm text-[var(--pz-muted)]">Enable certificates for this event</span>
        </label>
        <Field label="Minimum session attendance %" htmlFor="cfg-cert-pct">
          <input
            id="cfg-cert-pct"
            name="certificate_min_session_attendance_pct"
            type="number"
            min="0"
            max="100"
            defaultValue={event.certificate_min_session_attendance_pct ?? 60}
            className={inputCls}
          />
        </Field>
        {certTemplates.length > 0 && (
          <Field label="Certificate template" htmlFor="cfg-cert-tpl">
            <select id="cfg-cert-tpl" name="certificate_template_id" defaultValue={event.certificate_template_id ?? ''} className={inputCls}>
              <option value="">Use org default</option>
              {certTemplates.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>
              ))}
            </select>
          </Field>
        )}
        {certTemplates.length === 0 && (
          <p className="text-xs text-[var(--pz-muted)]">
            No certificate templates yet.{' '}
            <a href={`/orgs/${event.org_slug ?? event.org_id}/certificates`} className="text-[var(--pz-teal-ink)]">Create one in org settings →</a>
          </p>
        )}
        <button
          type="submit"
          className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
        >
          Save certificate settings
        </button>
      </form>
    </section>
  )
}
