import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { NextResponse } from 'next/server'

export async function GET() {
  const user = await requireUser()
  const supabase = await createClient()

  const [regsResult, messagesResult, surveyResult] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, event_id, ticket_type_id, status, amount_paid_cents, created_at, check_ins(checked_in_at)')
      .eq('attendee_email', user.email ?? ''),
    supabase
      .from('messages')
      .select('id, event_id, content, created_at')
      .eq('sender_id', user.id),
    supabase
      .from('survey_responses')
      .select('id, survey_id, answers, created_at')
      .eq('user_id', user.id),
  ])

  const exportData = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
    },
    registrations: regsResult.data ?? [],
    messages: messagesResult.data ?? [],
    survey_responses: surveyResult.data ?? [],
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="prezva-data-export-${Date.now()}.json"`,
    },
  })
}
