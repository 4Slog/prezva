import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'google_forms'
const SCOPES = ['https://www.googleapis.com/auth/forms.body.readonly']

const QUESTION_TYPE_MAP: Record<string, string> = {
  RADIO: 'multiple_choice',
  CHECKBOX: 'checkbox',
  DROP_DOWN: 'dropdown',
  SHORT_ANSWER: 'short_text',
  PARAGRAPH: 'long_text',
  SCALE: 'rating',
  DATE: 'date',
  TIME: 'time',
  FILE_UPLOAD: 'file_upload',
}

class GoogleFormsAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Google Forms'

  isConfigured(): boolean {
    return !!((process.env.GOOGLE_FORMS_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID) && (process.env.GOOGLE_FORMS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET))
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Google Forms not configured')
    const url = getAuthUrl(PROVIDER, (process.env.GOOGLE_FORMS_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID)!, redirectUri, SCOPES, state)
    return url + '&access_type=offline&prompt=consent'
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, (process.env.GOOGLE_FORMS_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID)!, (process.env.GOOGLE_FORMS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)!)
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      await supabase.from('org_integrations').upsert({ org_id: orgId, provider: PROVIDER, status: 'connected', encrypted_refresh_token: encryptedToken, scopes: SCOPES, last_synced_at: new Date().toISOString() }, { onConflict: 'org_id,provider' })
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'handleCallback', err); throw err }
  }

  async disconnect(orgId: string): Promise<void> {
    const supabase = await createClient()
    await supabase.from('org_integrations').update({ status: 'available', encrypted_refresh_token: null }).eq('org_id', orgId).eq('provider', PROVIDER)
  }

  async getStatus(orgId: string): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return 'awaiting_credentials'
    const supabase = await createClient()
    const { data } = await supabase.from('org_integrations').select('status').eq('org_id', orgId).eq('provider', PROVIDER).maybeSingle()
    return (data?.status as IntegrationStatus) ?? 'available'
  }

  async getAccessToken(orgId: string): Promise<string | null> {
    const supabase = await createClient()
    const { data } = await supabase.from('org_integrations').select('encrypted_refresh_token').eq('org_id', orgId).eq('provider', PROVIDER).single()
    if (!data?.encrypted_refresh_token) return null
    try {
      return refreshAccessToken(PROVIDER, decryptToken(data.encrypted_refresh_token), (process.env.GOOGLE_FORMS_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID)!, (process.env.GOOGLE_FORMS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)!)
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err); return null }
  }

  async importForm(orgId: string, eventId: string, formId: string): Promise<{ surveyId: string | null; questionCount: number; errors: number }> {
    const token = await this.getAccessToken(orgId)
    if (!token) return { surveyId: null, questionCount: 0, errors: 0 }

    try {
      const res = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      const form = await res.json()

      const supabase = await createClient()
      const { data: survey, error: surveyErr } = await supabase
        .from('surveys')
        .insert({ event_id: eventId, title: form.info?.title ?? 'Imported Form', description: form.info?.documentTitle ?? null })
        .select('id')
        .single()
      if (surveyErr || !survey) throw surveyErr ?? new Error('Survey insert failed')

      const items: any[] = form.items ?? []
      let questionCount = 0
      let errors = 0

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const qi = item.questionItem?.question
        if (!qi) continue
        const questionType = QUESTION_TYPE_MAP[qi.choiceQuestion?.type ?? qi.scaleQuestion ? 'SCALE' : qi.dateQuestion ? 'DATE' : qi.timeQuestion ? 'TIME' : qi.fileUploadQuestion ? 'FILE_UPLOAD' : qi.textQuestion?.paragraph ? 'PARAGRAPH' : 'SHORT_ANSWER'] ?? 'short_text'
        const options = qi.choiceQuestion?.options?.map((o: any) => o.value) ?? null
        const { error: qErr } = await supabase.from('survey_questions').insert({
          survey_id: survey.id,
          question_text: item.title ?? '',
          question_type: questionType,
          options,
          required: qi.required ?? false,
          sort_order: i,
        })
        if (qErr) errors++
        else questionCount++
      }

      await supabase.from('org_integrations').update({ last_synced_at: new Date().toISOString() }).eq('org_id', orgId).eq('provider', PROVIDER)
      return { surveyId: survey.id, questionCount, errors }
    } catch (err: any) {
      await logIntegrationError(orgId, PROVIDER, 'importForm', err, { formId, eventId })
      return { surveyId: null, questionCount: 0, errors: 1 }
    }
  }
}

export const googleFormsAdapter = new GoogleFormsAdapter()
export default googleFormsAdapter
