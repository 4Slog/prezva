import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildEmbedEventNav } from '@/lib/embedded/event-nav'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedEventOverviewPage({ params }: Props) {
  const { eventId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    const session = await verifyEmbeddedSession(token)
    const db = createAdminClient()
    const { data: link } = await db
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', session.location_id)
      .maybeSingle()
    if (!link) redirect('/embedded/events')

    const { data: event } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('org_id', link.org_id)
      .maybeSingle()
    if (!event) redirect('/embedded/events')
  } catch {
    redirect('/embedded/events')
  }

  const { groups } = buildEmbedEventNav(eventId)

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {groups.map(group => {
          const GroupIcon = group.icon
          const firstItem = group.items.find(i => i.built)

          return (
            <div
              key={group.id}
              className="flex flex-col gap-3 rounded-xl border p-4"
              style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface-2)' }}
            >
              {/* Group heading */}
              <div className="flex items-center gap-2">
                <GroupIcon size={15} style={{ color: 'var(--pz-teal)', flexShrink: 0 }} />
                {firstItem ? (
                  <a
                    href={firstItem.href}
                    className="text-sm font-semibold transition-opacity hover:opacity-75"
                    style={{ color: 'var(--pz-text)' }}
                  >
                    {group.label}
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--pz-muted)' }}>
                    {group.label}
                    <span
                      className="rounded px-1 text-[10px] font-medium leading-4"
                      style={{ background: 'var(--pz-border)', color: 'var(--pz-muted)' }}
                    >
                      soon
                    </span>
                  </span>
                )}
              </div>
              {/* Item list */}
              <ul className="flex flex-col gap-1">
                {group.items.map(item => {
                  const ItemIcon = item.icon
                  return (
                    <li key={item.label} className="flex items-center gap-1.5">
                      <ItemIcon
                        size={11}
                        style={{
                          color: item.built ? 'var(--pz-muted)' : 'var(--pz-border)',
                          flexShrink: 0,
                        }}
                      />
                      {item.built ? (
                        <a
                          href={item.href}
                          className="text-xs transition-opacity hover:opacity-75"
                          style={{ color: 'var(--pz-muted)' }}
                          {...(item.external ? { target: '_top' } : {})}
                        >
                          {item.label}
                        </a>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--pz-border)' }}>
                          {item.label}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
