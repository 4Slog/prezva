import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { NextRequest, NextResponse } from 'next/server'

function csvEscape(val: unknown): string {
  return '"' + String(val ?? '').replace(/"/g, '""') + '"'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> },
) {
  const user = await requireUser()
  const supabase = await createClient()
  const { id: eventId, surveyId } = await params

  // Verify org membership
  const { data: event } = await supabase.from('events').select('org_id').eq('id', eventId).maybeSingle()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const { data: member } = await supabase.from('org_members').select('role').eq('org_id', (event as any).org_id).eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { data: questions } = await supabase
    .from('survey_questions')
    .select('id, question_text, sort_order')
    .eq('survey_id', surveyId)
    .order('sort_order', { ascending: true })

  const { data: responses } = await supabase
    .from('survey_responses')
    .select('id, created_at, user_id, registration_id, survey_answers(question_id, answer_text)')
    .eq('survey_id', surveyId)
    .order('created_at', { ascending: true })

  const qs = questions ?? []
  const headers = ['Response ID', 'Submitted At', ...qs.map(q => q.question_text)]

  const rows = (responses ?? []).map(r => {
    const answerMap: Record<string, string> = {}
    for (const a of (r as any).survey_answers ?? []) {
      answerMap[a.question_id] = a.answer_text
    }
    return [
      r.id,
      new Date(r.created_at).toLocaleString(),
      ...qs.map(q => answerMap[q.id] ?? ''),
    ]
  })

  const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="survey-${surveyId}-responses.csv"`,
    },
  })
}
