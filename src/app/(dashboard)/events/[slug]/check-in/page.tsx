import { redirect } from "next/navigation"
type Props = { params: Promise<{ slug: string }> }
export default async function CheckInRedirect({ params }: Props) {
  const { slug } = await params
  redirect(`/events/${slug}/checkin`)
}
