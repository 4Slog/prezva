'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { logAudit } from '@/lib/audit/log'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { getSuppressedEmailSet } from '@/lib/email/suppression'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type QuestionType = 'text' | 'rating' | 'multiple_choice' | 'boolean'

export interface Survey {
  id: string; event_id: string; title: string; description: string | null
  status: string; created_at: string
}
export interface SurveyQuestion {
  id: string; survey_id: string; question_text: string; question_type: QuestionType
  options: string[] | null; is_required: boolean; sort_order: number
}

const SurveySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
})
const QuestionSchema = z.object({
  question_text: z.string().min(1).max(500),
  question_type: z.enum(['text', 'rating', 'multiple_choice', 'boolean']),
  options: z.string().optional(),
  required: z.string().optional(),
  sort_order: z.string().optional(),
})

export async function getSurveys(eventId: string) {
  const supabase = await createClient()
  await requireUser()
  const { data } = await supabase.from('surveys').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
  return data ?? []
}

export async function getSurveyWithQuestions(surveyId: string) {
  const supabase = await createClient()
  await requireUser()
  const { data: survey } = await supabase.from('surveys').select('*').eq('id', surveyId).single()
  const { data: questions } = await supabase.from('survey_questions').select('*').eq('survey_id', surveyId).order('sort_order', { ascending: true })
  return { survey, questions: questions ?? [] }
}

export async function createSurvey(eventId: string, formData: FormData) {
  const supabase = await createClient()
  const user = await requireUser()
  const parsed = SurveySchema.safeParse({ title: formData.get('title'), description: formData.get('description') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { data, error } = await supabase
    .from('surveys').insert({ event_id: eventId, created_by: user.id, title: parsed.data.title, description: parsed.data.description ?? null, status: 'draft' })
    .select().single()
  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'survey.create', 'surveys', data.id, { title: parsed.data.title })
  revalidatePath('/dashboard')
  return { data }
}

export async function addQuestion(surveyId: string, formData: FormData) {
  const supabase = await createClient()
  await requireUser()
  const raw = { question_text: formData.get('question_text'), question_type: formData.get('question_type'), options: formData.get('options') as string, required: formData.get('required'), sort_order: formData.get('sort_order') }
  const parsed = QuestionSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const options = parsed.data.question_type === 'multiple_choice' && parsed.data.options
    ? parsed.data.options.split('\n').map(o => o.trim()).filter(Boolean)
    : null
  const { data, error } = await supabase
    .from('survey_questions').insert({
      survey_id: surveyId, question_text: parsed.data.question_text,
      question_type: parsed.data.question_type, options,
      is_required: parsed.data.required === 'true',
      sort_order: parseInt(parsed.data.sort_order ?? '0', 10),
    }).select().single()
  if (error) return { error: error.message }
  return { data }
}

export async function updateQuestion(questionId: string, formData: FormData) {
  const supabase = await createClient()
  await requireUser()
  const raw = { question_text: formData.get('question_text'), question_type: formData.get('question_type'), options: formData.get('options') as string, required: formData.get('required'), sort_order: formData.get('sort_order') }
  const parsed = QuestionSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const options = parsed.data.question_type === 'multiple_choice' && parsed.data.options
    ? parsed.data.options.split('\n').map(o => o.trim()).filter(Boolean)
    : null
  const { data, error } = await supabase
    .from('survey_questions').update({
      question_text: parsed.data.question_text,
      question_type: parsed.data.question_type, options,
      is_required: parsed.data.required === 'true',
      sort_order: parseInt(parsed.data.sort_order ?? '0', 10),
    }).eq('id', questionId).select().single()
  if (error) return { error: error.message }
  return { data }
}

export async function deleteQuestion(questionId: string) {
  const supabase = await createClient()
  await requireUser()
  const { error } = await supabase.from('survey_questions').delete().eq('id', questionId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function publishSurvey(surveyId: string) {
  const supabase = await createClient()
  const user = await requireUser()
  const { error } = await supabase.from('surveys').update({ status: 'active' }).eq('id', surveyId)
  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'survey.publish', 'surveys', surveyId)
  revalidatePath('/dashboard')
  return { success: true }
}

export async function closeSurvey(surveyId: string) {
  const supabase = await createClient()
  const user = await requireUser()
  const { error } = await supabase.from('surveys').update({ status: 'closed' }).eq('id', surveyId)
  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'survey.close', 'surveys', surveyId)
  revalidatePath('/dashboard')
  return { success: true }
}

export async function submitSurveyResponseByToken(surveyId: string, token: string, answers: Record<string, string>) {
  // Admin client: anon inserts on survey_answers are blocked by RLS
  // (requires sr.user_id = auth.uid()). The token check below provides authz.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  if (!token) return { error: 'Invalid or expired token' }

  const { data: reg } = await admin
    .from('registrations')
    .select('id, event_id')
    .eq('qr_code', token)
    .maybeSingle()
  if (!reg) return { error: 'Invalid or expired token' }

  const eventId = (reg as any).event_id
  const registrationId = (reg as any).id

  const { data: survey } = await admin.from('surveys').select('event_id, status').eq('id', surveyId).maybeSingle()
  if (!survey || survey.event_id !== eventId) return { error: 'Survey not found' }
  if (survey.status !== 'active') return { error: 'This survey is not accepting responses' }

  const { data: resp, error: respErr } = await admin
    .from('survey_responses')
    .insert({ survey_id: surveyId, user_id: null, registration_id: registrationId })
    .select().single()
  if (respErr) return { error: respErr.message }

  const answerRows = Object.entries(answers).map(([questionId, answer]) => ({
    response_id: resp.id, question_id: questionId, answer_text: answer,
  }))
  if (answerRows.length > 0) {
    const { error: ansErr } = await admin.from('survey_answers').insert(answerRows)
    if (ansErr) return { error: ansErr.message }
  }

  let awardedPoints = 0
  try {
    const { awardPointsForReg } = await import('@/lib/engagement/sprint10-actions')
    awardedPoints = await awardPointsForReg(eventId, registrationId, 'survey_complete')
  } catch { /* points failure must not break the submission */ }

  return { success: true, awardedPoints }
}

export async function getSurveyResults(surveyId: string) {
  const supabase = await createClient()
  await requireUser()
  const { data: responses } = await supabase.from('survey_responses').select('*').eq('survey_id', surveyId)
  const { data: answers } = await supabase.from('survey_answers').select('*, survey_questions(question_text, question_type)').eq('survey_questions.survey_id', surveyId)
  return { responseCount: responses?.length ?? 0, answers: answers ?? [] }
}

interface TemplateQuestion {
  type: string
  label: string
  options?: string[] | string
  required?: boolean
  scale?: number
}

export async function createSurveyFromTemplate(
  eventId: string,
  title: string,
  description: string,
  questions: TemplateQuestion[]
): Promise<{ data?: Survey; error?: string }> {
  const supabase = await createClient()
  const user = await requireUser()

  const { data: survey, error: surveyErr } = await supabase
    .from('surveys')
    .insert({ event_id: eventId, created_by: user.id, title, description: description || null, status: 'draft' })
    .select()
    .single()
  if (surveyErr) return { error: surveyErr.message }

  const surveyId = (survey as Survey).id
  const typeMap: Record<string, string> = {
    nps: 'rating', rating: 'rating', multi_choice: 'multiple_choice',
    short_text: 'text', long_text: 'text', boolean: 'boolean', number: 'text',
  }
  const rows = questions.map((q, i) => ({
    survey_id: surveyId,
    question_text: q.label,
    question_type: typeMap[q.type] ?? 'text',
    options: Array.isArray(q.options) ? q.options : null,
    is_required: q.required ?? false,
    sort_order: i,
  }))

  if (rows.length > 0) {
    await supabase.from('survey_questions').insert(rows)
  }

  revalidatePath('/dashboard')
  return { data: survey as Survey }
}

export async function sendSurveyToAllAttendees(surveyId: string, eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, slug, title, organizations(id)')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return { error: 'Event not found' }
  const orgId = (event.organizations as any)?.id
  try { await assertPermission(orgId, user.id, 'surveys.manage') } catch (e) { return catchPermission(e) }

  const { data: regs } = await supabase
    .from('registrations')
    .select('id, attendee_email, attendee_name, qr_code')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  if (!regs?.length) return { error: 'No confirmed registrations found' }

  const suppressedSet = await getSuppressedEmailSet(supabase)
  const eligibleRegs = regs.filter((reg) => !suppressedSet.has(reg.attendee_email.toLowerCase()))

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  let sent = 0, errors = 0
  for (const reg of eligibleRegs) {
    const surveyUrl = `${appUrl}/survey/${surveyId}?token=${reg.qr_code}`
    try {
      await resend.emails.send({
        from: 'noreply@prezva.app',
        to: reg.attendee_email,
        subject: `Your feedback matters — ${event.title}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <p>Hi ${reg.attendee_name},</p>
          <p>Thank you for attending <strong>${event.title}</strong>. We'd love your feedback.</p>
          <p><a href="${surveyUrl}" style="background:#2DD4BF;color:#0D1B2A;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">Take the survey</a></p>
          <p style="font-size:12px;color:#888;">Or copy: ${surveyUrl}</p>
        </div>`,
      })
      sent++
    } catch { errors++ }
  }
  return { ok: true, sent, errors, total: regs.length }
}
