'use client'

import { useState } from 'react'
import { submitSurveyResponseByToken } from '@/lib/surveys/actions'

interface Question {
  id: string
  question_text: string
  question_type: string
  options: string[] | null
  is_required: boolean
  sort_order: number
}

interface SurveyGuestFormProps {
  surveyId: string
  token?: string
  questions: Question[]
}

export function SurveyGuestForm({ surveyId, token = '', questions }: SurveyGuestFormProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const result = await submitSurveyResponseByToken(surveyId, token, answers)
    if (result.error) { setError(result.error); setSubmitting(false); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="rounded-xl border border-[var(--pz-teal)]/30 bg-[var(--pz-surface)] p-8 text-center">
        <p className="text-xl font-bold text-[var(--pz-teal-ink)]">Thank you!</p>
        <p className="text-sm text-[var(--pz-muted)] mt-2">Your response has been recorded.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {questions.map(q => (
        <div key={q.id} className="rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)] p-5 space-y-3">
          <label className="text-sm font-medium text-[var(--pz-text)]">
            {q.question_text}
            {q.is_required && <span className="text-[var(--pz-error)] ml-1">*</span>}
          </label>

          {q.question_type === 'text' && (
            <textarea
              value={answers[q.id] ?? ''}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              required={q.is_required}
              rows={3}
              className="w-full bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)] resize-none"
            />
          )}

          {q.question_type === 'rating' && (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAnswers(prev => ({ ...prev, [q.id]: String(n) }))}
                  className={`w-10 h-10 rounded-lg text-sm font-semibold transition-colors ${answers[q.id] === String(n) ? 'bg-[var(--pz-teal)] text-[var(--pz-on-accent)]' : 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)] hover:bg-[var(--pz-border)]'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {q.question_type === 'boolean' && (
            <div className="flex gap-3">
              {['Yes', 'No'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${answers[q.id] === opt ? 'bg-[var(--pz-teal)] text-[var(--pz-on-accent)]' : 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)] hover:bg-[var(--pz-border)]'}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.question_type === 'multiple_choice' && (q.options ?? []).map(opt => (
            <label key={opt} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name={q.id}
                value={opt}
                checked={answers[q.id] === opt}
                onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                required={q.is_required}
                className="accent-[var(--pz-teal)]"
              />
              <span className="text-sm text-[var(--pz-text)]">{opt}</span>
            </label>
          ))}
        </div>
      ))}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg px-4 py-3 bg-[var(--pz-teal)] text-[var(--pz-on-accent)] text-sm font-semibold hover:bg-[#00D4B8] transition-colors disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit Response'}
      </button>
    </form>
  )
}
