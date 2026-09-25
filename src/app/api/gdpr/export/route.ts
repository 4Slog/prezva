import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildGdprExport } from '@/lib/gdpr/export'

// E-R4: everything Prezva holds about the signed-in person, matched by their
// user id and — only once confirmed — their auth email (guest registrations,
// speaker/volunteer rows). A failed query fails the export rather than
// returning a file that silently omits data.
export async function GET() {
  const user = await requireUser()
  const verifiedEmail = user.email && user.email_confirmed_at ? user.email.trim().toLowerCase() : null

  try {
    const data = await buildGdprExport(createAdminClient() as unknown as SupabaseClient, {
      userId: user.id,
      email: verifiedEmail,
    })
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="prezva-data-export-${Date.now()}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[gdpr export] failed', (e as Error).message)
    return NextResponse.json(
      { error: 'Your data export could not be completed. Please try again, or contact support if it keeps failing.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
