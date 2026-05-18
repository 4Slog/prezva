import { createAdminClient } from "@/lib/supabase/admin"
import { notFound } from "next/navigation"
import SelfCheckInClient from "./self-checkin-client"

type Props = { params: Promise<{ token: string }> }

export default async function SelfCheckInPage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()
  const { data: reg } = await admin
    .from("registrations")
    .select("id, status")
    .eq("qr_code", token)
    .maybeSingle()
  if (!reg) notFound()
  return <SelfCheckInClient token={token} />
}
