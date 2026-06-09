'use client'

import { createContext, useContext } from 'react'

interface EmbeddedBrand {
  productName: string
  poweredBy: boolean
}

const defaults: EmbeddedBrand = {
  productName: 'Events',
  poweredBy: true,
}

const EmbeddedBrandContext = createContext<EmbeddedBrand>(defaults)

export function EmbeddedBrandProvider({
  children,
  value = defaults,
}: {
  children: React.ReactNode
  value?: EmbeddedBrand
}) {
  return (
    <EmbeddedBrandContext.Provider value={value}>
      {children}
    </EmbeddedBrandContext.Provider>
  )
}

export function useEmbeddedBrand(): EmbeddedBrand {
  return useContext(EmbeddedBrandContext)
}
