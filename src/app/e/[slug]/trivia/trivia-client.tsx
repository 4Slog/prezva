'use client'

import { useState } from 'react'
import { submitTriviaAnswer } from '@/lib/engagement/sprint10-actions'

type Props = { questions: any[] }

export function TriviaClient({ questions }: Props) {
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<{ correct: boolean; points: number } | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const q = questions[current]

  async function answer(optionIndex: number) {
    if (selected !== null) return
    setSelected(optionIndex)
    const res = await submitTriviaAnswer(q.id, optionIndex)
    setResult({ correct: res.correct, points: res.points ?? 0 })
    if (res.correct) setScore(s => s + (res.points ?? 0))
  }

  function next() {
    if (current + 1 >= questions.length) {
      setDone(true)
    } else {
      setCurrent(c => c + 1)
      setSelected(null)
      setResult(null)
    }
  }

  if (done) {
    return (
      <div className="pz-card p-8 text-center">
        <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--pz-teal)' }}>{score} pts</p>
        <p style={{ color: 'var(--pz-text)', marginTop: 8 }}>Trivia complete!</p>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginTop: 4 }}>Points added to your leaderboard score.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>Question {current + 1} of {questions.length}</p>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-teal)' }}>{score} pts so far</p>
      </div>

      <div className="pz-card p-5">
        <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--pz-text)', marginBottom: 20 }}>{q.body}</p>
        <div className="space-y-2">
          {(q.options ?? []).map((opt: any, i: number) => {
            let bg = 'var(--pz-surface-2)'
            let color = 'var(--pz-text)'
            if (selected !== null) {
              if (i === q.correct_index) { bg = 'var(--pz-success)'; color = '#fff' }
              else if (i === selected && !result?.correct) { bg = 'var(--pz-error, var(--pz-error))'; color = '#fff' }
            }
            return (
              <button
                key={i}
                onClick={() => answer(i)}
                disabled={selected !== null}
                className="w-full text-left rounded-lg px-4 py-3 text-sm"
                style={{ background: bg, color, border: selected === i ? `2px solid ${bg}` : '2px solid transparent' }}
              >
                {opt.label ?? opt}
              </button>
            )
          })}
        </div>

        {result && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 600, color: result.correct ? 'var(--pz-success)' : 'var(--pz-error, var(--pz-error))' }}>
              {result.correct ? `Correct! +${result.points} pts` : 'Incorrect'}
            </p>
            <button onClick={next} className="pz-btn-primary text-sm px-5 py-2 mt-3">
              {current + 1 >= questions.length ? 'Finish' : 'Next question'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
