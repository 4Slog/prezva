'use client'

import { useEffect, useRef } from 'react'

interface ModalProps {
  onClose: () => void
  children: React.ReactNode
  title?: string
  maxWidth?: string
}

export function Modal({ onClose, children, title, maxWidth = 'max-w-md' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={ref}
          role="dialog"
          aria-modal
          aria-label={title}
          className={`pointer-events-auto w-full ${maxWidth} rounded-xl shadow-2xl`}
          style={{
            background: 'var(--pz-surface)',
            border: '1px solid var(--pz-border)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--pz-border)' }}
            >
              <h2 className="text-base font-semibold" style={{ color: 'var(--pz-text)' }}>
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 transition-opacity hover:opacity-70"
                style={{ color: 'var(--pz-text-muted)' }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          )}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </>
  )
}
