interface FieldCounter {
  value: number
  max: number
}

interface FieldProps {
  label: string
  htmlFor: string
  required?: boolean
  helper?: string
  error?: string
  counter?: FieldCounter
  children: React.ReactNode
}

export function Field({ label, htmlFor, required, helper, error, counter, children }: FieldProps) {
  const counterOver = counter ? counter.value > counter.max : false

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-sm font-medium"
        style={{ color: 'var(--pz-text)' }}
      >
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: 'var(--pz-error)' }}>*</span>
        )}
      </label>

      {children}

      <div className="flex items-start justify-between gap-2 min-h-[1.125rem]">
        <span
          className="text-xs leading-none"
          style={{ color: error ? 'var(--pz-error)' : 'var(--pz-muted)' }}
          role={error ? 'alert' : undefined}
        >
          {error ?? helper ?? ''}
        </span>
        {counter && (
          <span
            className="flex-shrink-0 text-xs leading-none tabular-nums"
            style={{ color: counterOver ? 'var(--pz-error)' : 'var(--pz-muted)' }}
            aria-live="polite"
          >
            {counter.value}/{counter.max}
          </span>
        )}
      </div>
    </div>
  )
}
