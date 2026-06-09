'use client'

import { useEmbeddedBrand } from './brand'

export function EmbeddedFooter() {
  const { poweredBy } = useEmbeddedBrand()

  if (!poweredBy) return null

  return (
    <footer className="border-t border-gray-100 py-2 text-center text-xs text-gray-400">
      Powered by Prezva
    </footer>
  )
}
