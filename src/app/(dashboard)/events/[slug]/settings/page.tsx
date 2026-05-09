import { notFound } from 'next/navigation'
import { getEventBySlug, updateEvent, deleteEvent } from '@/lib/events/actions'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function EventSettingsPage({ params }: Props) {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) notFound()

  const inputCls = 'w-full rounded-lg border border-[#1E3A5F] bg-[#112240] px-3 py-2 text-sm text-[#F0F4F8] focus:border-[#00BFA6] focus:outline-none focus:ring-1 focus:ring-[#00BFA6]'
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
          <button
            type="submit"
            className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Save changes
          </button>
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
          <button
            type="submit"
            className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Save venue
          </button>
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
          <button
            type="submit"
            className="self-start rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Save settings
          </button>
        </form>
      </section>

      {/* Danger zone */}
      {['draft', 'cancelled'].includes(event.status) && (
        <section className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-6">
          <h2 className="text-sm font-semibold text-[#EF4444] mb-2">Danger zone</h2>
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
              className="rounded-lg border border-[#EF4444]/40 px-4 py-2 text-sm font-medium text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
            >
              Delete event
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
