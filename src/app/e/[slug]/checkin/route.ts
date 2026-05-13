import { redirect } from 'next/navigation'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/events/${slug}/checkin`)
}
