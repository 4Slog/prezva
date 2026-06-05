'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastOptions {
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

interface VariantConfig {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  iconColor: string
  border: string
}

const VARIANT_CONFIG: Record<ToastVariant, VariantConfig> = {
  success: { icon: CheckCircle2, iconColor: 'var(--pz-success)',  border: 'var(--pz-success-bg)' },
  error:   { icon: XCircle,      iconColor: 'var(--pz-error)',    border: 'var(--pz-error-bg)' },
  info:    { icon: Info,         iconColor: 'var(--pz-teal-ink)', border: 'var(--pz-border)' },
}

interface ToastCardProps {
  item: ToastItem
  onDismiss: () => void
}

function ToastCard({ item, onDismiss }: ToastCardProps) {
  const { icon: Icon, iconColor, border } = VARIANT_CONFIG[item.variant]
  return (
    <div
      role="alert"
      aria-live="polite"
      className="pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 min-w-[280px] max-w-sm"
      style={{
        background: 'var(--pz-surface)',
        border: `1px solid ${border}`,
        boxShadow: 'var(--pz-shadow)',
      }}
    >
      <Icon size={18} style={{ color: iconColor, flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{item.title}</p>
        {item.description && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 rounded p-0.5 transition-opacity hover:opacity-60"
        style={{ color: 'var(--pz-muted)' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((opts: ToastOptions) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts(prev => [...prev, { ...opts, id }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none"
      >
        {toasts.map(item => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
