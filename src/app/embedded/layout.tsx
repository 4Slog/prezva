import { notFound } from 'next/navigation'
import { isGhlEventsEnabled } from '@/lib/integrations/ghl/config'
import { EmbeddedBrandProvider } from '@/lib/embedded/brand'
import { EmbeddedFooter } from '@/lib/embedded/footer'

export default function EmbeddedLayout({ children }: { children: React.ReactNode }) {
  if (!isGhlEventsEnabled()) notFound()

  return (
    <EmbeddedBrandProvider>
      <div className="flex min-h-screen flex-col bg-white text-gray-900">
        <main className="flex flex-1 flex-col">
          {children}
        </main>
        <EmbeddedFooter />
      </div>
    </EmbeddedBrandProvider>
  )
}
