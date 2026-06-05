import { notFound } from 'next/navigation'
import { getEventBySlug } from '@/lib/events/actions'
import { PageNav } from '@/components/ui/PageNav'

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) notFound()

  return (
    <>
      <PageNav
        home="/dashboard"
        trail={[
          { label: 'Events', href: '/events' },
          { label: event.title, href: `/events/${slug}` },
        ]}
        basePath={`/events/${slug}`}
      />
      {children}
    </>
  )
}
