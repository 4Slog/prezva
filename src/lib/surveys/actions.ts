'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
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

export async function publishSurvey(surveyId: string) {
  const supabase = await createClient()
  await requireUser()
  const { error } = await supabase.from('surveys').update({ status: 'active' }).eq('id', surveyId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function closeSurvey(surveyId: string) {
  const supabase = await createClient()
  await requireUser()
  const { error } = await supabase.from('surveys').update({ status: 'closed' }).eq('id', surveyId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function submitSurveyResponse(surveyId: string, answers: Record<string, string>) {
  const supabase = await createClient()
  const user = await requireUser()
  const { data: resp, error: respErr } = await supabase
    .from('survey_responses').insert({ survey_id: surveyId, user_id: user.id }).select().single()
  if (respErr) return { error: respErr.message }
  const answerRows = Object.entries(answers).map(([questionId, answer]) => ({
    response_id: resp.id, question_id: questionId, answer_text: answer,
  }))
  if (answerRows.length > 0) {
    const { error: ansErr } = await supabase.from('survey_answers').insert(answerRows)
    if (ansErr) return { error: ansErr.message }
  }
  return { success: true }
}

export async function getSurveyResults(surveyId: string) {
  const supabase = await createClient()
  await requireUser()
  const { data: responses } = await supabase.from('survey_responses').select('*').eq('survey_id', surveyId)
  const { data: answers } = await supabase.from('survey_answers').select('*, survey_questions(question_text, question_type)').eq('survey_questions.survey_id', surveyId)
  return { responseCount: responses?.length ?? 0, answers: answers ?? [] }
}
