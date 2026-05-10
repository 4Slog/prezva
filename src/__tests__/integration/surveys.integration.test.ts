/**
 * Integration: survey_questions schema
 * Sprint 1 bugs:
 *   - column was required but real name is is_required
 *   - enum value was yes_no but real value is boolean
 * These tests would have failed before Sprint 1 was applied.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { db, DEMO, cleanupIntTestData } from './setup'

afterAll(cleanupIntTestData)

describe('surveys — schema integration', () => {
  it('survey_questions has is_required column (not required)', async () => {
    const { data, error } = await db
      .from('survey_questions')
      .select('id, question_text, question_type, is_required, sort_order')
      .eq('survey_id', DEMO.surveyId)
      .limit(1)

    expect(error).toBeNull()
    // Column is_required must exist — no 42703 error
    if (data && data.length > 0) {
      expect(data[0]).toHaveProperty('is_required')
      expect(data[0]).not.toHaveProperty('required')
    }
  })

  it('inserts survey_question with is_required=true and type=boolean', async () => {
    const { data, error } = await db.from('survey_questions').insert({
      survey_id:     DEMO.surveyId,
      question_text: 'inttest — would you attend again? (boolean)',
      question_type: 'boolean',
      is_required:   true,
      sort_order:    99,
      options:       null,
    }).select().single()

    expect(error).toBeNull()
    expect(data!.question_type).toBe('boolean')
    expect(data!.is_required).toBe(true)
    // cleanup: afterAll deletes rows where question_text like '%inttest%'
  })

  it('inserts survey_question with is_required=false and type=text', async () => {
    const { data, error } = await db.from('survey_questions').insert({
      survey_id:     DEMO.surveyId,
      question_text: 'inttest — any other comments? (text)',
      question_type: 'text',
      is_required:   false,
      sort_order:    100,
      options:       null,
    }).select().single()

    expect(error).toBeNull()
    expect(data!.is_required).toBe(false)
  })

  it('getSurveys query returns surveys for event', async () => {
    const { data, error } = await db
      .from('surveys')
      .select('*')
      .eq('event_id', DEMO.eventId)
      .order('created_at', { ascending: false })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBeGreaterThan(0)
  })
})
