'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Pencil, X, Save } from 'lucide-react'
import { addQuestion, updateQuestion, deleteQuestion } from '@/lib/surveys/actions'

interface Question {
  id: string
  question_text: string
  question_type: 'text' | 'rating' | 'multiple_choice' | 'boolean'
  options: string[] | null
  is_required: boolean
  sort_order: number
}

interface Survey {
  id: string
  title: string
  description: string | null
  status: string
}

const QUESTION_TYPES = [
  { value: 'text', label: 'Text (long answer)' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'rating', label: 'Rating (1–5)' },
  { value: 'boolean', label: 'Yes / No' },
] as const

export default function SurveyQuestionsClient({
  survey,
  questions: init,
  slug,
}: {
  survey: Survey
  questions: Question[]
  slug: string
}) {
  const [questions, setQuestions] = useState<Question[]>(init)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set('sort_order', String(questions.length))
    startTransition(async () => {
      const res = await addQuestion(survey.id, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.data) {
        setQuestions(prev => [...prev, res.data as Question])
        setShowAdd(false)
        form.reset()
      }
    })
  }

  function handleUpdate(questionId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateQuestion(questionId, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.data) {
        setQuestions(prev => prev.map(q => (q.id === questionId ? (res.data as Question) : q)))
        setEditingId(null)
      }
    })
  }

  function handleDelete(questionId: string) {
    if (!confirm('Delete this question?')) return
    startTransition(async () => {
      const res = await deleteQuestion(questionId)
      if (res.error) {
        setError(res.error)
        return
      }
      setQuestions(prev => prev.filter(q => q.id !== questionId))
    })
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link
          href={`/events/${slug}/surveys`}
          style={{ color: 'var(--color-teal)', fontSize: 13, textDecoration: 'none' }}
        >
          ← Back to Surveys
        </Link>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{survey.title}</h1>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              background: '#6b728022',
              color: '#6b7280',
              padding: '2px 8px',
              borderRadius: 20,
              textTransform: 'capitalize',
            }}
          >
            {survey.status}
          </span>
        </div>
        {survey.description && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>{survey.description}</p>
        )}
      </div>

      {error && (
        <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: '1rem' }}>{error}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.5rem' }}>
        {questions.length === 0 && !showAdd && (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            No questions yet. Add the first one below.
          </p>
        )}
        {questions.map((q, i) =>
          editingId === q.id ? (
            <QuestionEditForm
              key={q.id}
              question={q}
              index={i}
              onCancel={() => setEditingId(null)}
              onSubmit={e => handleUpdate(q.id, e)}
              isPending={isPending}
            />
          ) : (
            <div
              key={q.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                background: 'var(--color-surface)',
                padding: '1rem 1.25rem',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  fontWeight: 600,
                  minWidth: 20,
                }}
              >
                {i + 1}.
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600 }}>
                  {q.question_text}
                  {q.is_required && <span style={{ color: 'var(--pz-error)', marginLeft: 4 }}>*</span>}
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {QUESTION_TYPES.find(t => t.value === q.question_type)?.label ?? q.question_type}
                  {q.question_type === 'multiple_choice' && q.options && q.options.length > 0 && (
                    <> · {q.options.length} option{q.options.length !== 1 ? 's' : ''}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => setEditingId(q.id)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                }}
                aria-label="Edit question"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => handleDelete(q.id)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  color: 'var(--pz-error)',
                }}
                aria-label="Delete question"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ),
        )}
      </div>

      {showAdd ? (
        <QuestionEditForm
          index={questions.length}
          onCancel={() => setShowAdd(false)}
          onSubmit={handleAdd}
          isPending={isPending}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--color-teal)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '0.6rem 1.25rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Add Question
        </button>
      )}
    </div>
  )
}

function QuestionEditForm({
  question,
  index,
  onCancel,
  onSubmit,
  isPending,
}: {
  question?: Question
  index: number
  onCancel: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isPending: boolean
}) {
  const [type, setType] = useState<Question['question_type']>(question?.question_type ?? 'text')

  return (
    <form
      onSubmit={onSubmit}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: '1.25rem',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
      }}
    >
      <input type="hidden" name="sort_order" defaultValue={question?.sort_order ?? index} />

      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
          Question
        </label>
        <input
          name="question_text"
          required
          maxLength={500}
          defaultValue={question?.question_text ?? ''}
          placeholder="What did you think of the keynote?"
          style={{
            width: '100%',
            padding: '0.6rem 0.75rem',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
          Type
        </label>
        <select
          name="question_type"
          value={type}
          onChange={e => setType(e.target.value as Question['question_type'])}
          style={{
            padding: '0.6rem 0.75rem',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            fontSize: 14,
          }}
        >
          {QUESTION_TYPES.map(t => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {type === 'multiple_choice' && (
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            Options (one per line)
          </label>
          <textarea
            name="options"
            rows={4}
            required
            defaultValue={(question?.options ?? []).join('\n')}
            placeholder={'Option 1\nOption 2\nOption 3'}
            style={{
              width: '100%',
              padding: '0.6rem 0.75rem',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: 14,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          name="required"
          value="true"
          defaultChecked={question?.is_required ?? false}
        />
        Required
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={isPending}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--color-teal)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '0.6rem 1.25rem',
            fontWeight: 600,
            cursor: 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          <Save size={14} /> {question ? 'Save' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--color-border)',
            color: 'var(--color-text)',
            border: 'none',
            borderRadius: 8,
            padding: '0.6rem 1.25rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  )
}
