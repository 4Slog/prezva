'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { listGhlProductsForPicker, createTicketTypeFromEmbedProduct } from '@/lib/embedded/event-actions'
import type { GhlPickerProduct } from '@/lib/embedded/event-actions'

interface Props {
  eventId: string
}

function formatPrice(amount: number, currency: string): string {
  if (amount === 0) return 'Free'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100)
}

function QtyBadge({ qty }: { qty: number | null }) {
  if (qty === null) {
    return (
      <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}>
        Unlimited
      </span>
    )
  }
  const low = qty <= 5
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
      style={{
        background: low ? 'var(--pz-error, #fee2e2)' : 'var(--pz-surface-2)',
        color: low ? 'var(--pz-error-text, #dc2626)' : 'var(--pz-muted)',
      }}
    >
      {qty} left
    </span>
  )
}

export function GhlProductPicker({ eventId }: Props) {
  const [products, setProducts] = useState<GhlPickerProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const [linkingId, setLinkingId] = useState<string | null>(null)

  const applyProductsResult = useCallback(
    (result: Awaited<ReturnType<typeof listGhlProductsForPicker>>) => {
      if ('error' in result) {
        setFetchError(result.error)
      } else {
        setProducts(result)
        setFetchError(null)
      }
      setLoading(false)
    },
    [],
  )

  // Retry button handler — synchronous setState in an event handler is legal.
  async function loadProducts() {
    setLoading(true)
    setFetchError(null)
    applyProductsResult(await listGhlProductsForPicker(eventId))
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await listGhlProductsForPicker(eventId)
      if (cancelled) return
      applyProductsResult(result)
    })()
    return () => { cancelled = true }
  }, [eventId, applyProductsResult])

  async function handleLink(product: GhlPickerProduct) {
    if (product.alreadyMapped || isPending) return
    const key = product.priceId
    setLinkingId(key)
    setRowErrors(prev => ({ ...prev, [key]: '' }))

    startTransition(async () => {
      const result = await createTicketTypeFromEmbedProduct(eventId, product.productId, product.priceId)
      if ('error' in result) {
        setRowErrors(prev => ({ ...prev, [key]: result.error === 'price_already_mapped' ? 'Already linked' : result.error }))
      } else {
        // Optimistically mark as mapped
        setProducts(prev => prev.map(p => p.priceId === key ? { ...p, alreadyMapped: true } : p))
      }
      setLinkingId(null)
    })
  }

  const borderColor = 'var(--pz-border)'
  const surface = 'var(--pz-surface)'
  const surface2 = 'var(--pz-surface-2)'
  const textColor = 'var(--pz-text)'
  const mutedColor = 'var(--pz-muted)'
  const tealColor = 'var(--pz-teal)'
  const tealInk = 'var(--pz-on-accent, #fff)'

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8" style={{ color: mutedColor }}>
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm">Loading GHL products…</span>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor, background: surface, color: 'var(--pz-error, #dc2626)' }}>
        <p className="font-medium">Failed to load products</p>
        <p className="mt-1 text-xs opacity-75">{fetchError}</p>
        <button
          onClick={loadProducts}
          className="mt-3 rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ background: surface2, color: textColor, border: `1px solid ${borderColor}` }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center"
        style={{ borderColor, background: surface2 }}
      >
        <p className="text-sm font-medium" style={{ color: mutedColor }}>No GHL products found</p>
        <p className="mt-1 text-xs" style={{ color: mutedColor }}>
          Create products in GHL → Payments → Products, then return here to link them.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {products.map(product => {
        const key = product.priceId
        const isLinking = linkingId === key && isPending
        const err = rowErrors[key]

        return (
          <div
            key={key}
            className="flex items-center gap-3 rounded-xl border p-3 transition-colors"
            style={{
              borderColor: product.alreadyMapped ? tealColor : borderColor,
              background: product.alreadyMapped ? `color-mix(in srgb, ${tealColor} 6%, ${surface})` : surface,
              opacity: product.alreadyMapped ? 0.85 : 1,
            }}
          >
            {/* Text info */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold" style={{ color: textColor }}>
                {product.productName}
              </span>
              {product.priceName !== product.productName && (
                <span className="truncate text-xs" style={{ color: mutedColor }}>{product.priceName}</span>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-medium" style={{ color: tealColor }}>
                  {formatPrice(product.amount, product.currency)}
                </span>
                <QtyBadge qty={product.availableQuantity} />
              </div>
              {err && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--pz-error, #dc2626)' }}>{err}</p>
              )}
            </div>

            {/* Action */}
            {product.alreadyMapped ? (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: tealColor, color: tealInk }}
              >
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
                </svg>
                Linked
              </span>
            ) : (
              <button
                onClick={() => handleLink(product)}
                disabled={isLinking || isPending}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
                style={{ background: tealColor, color: tealInk }}
              >
                {isLinking ? (
                  <>
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Linking…
                  </>
                ) : 'Link'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
