import { notFound } from 'next/navigation'
import { isGhlEventsEnabled } from '@/lib/integrations/ghl/config'

export default function EmbeddedLayout({ children }: { children: React.ReactNode }) {
  if (!isGhlEventsEnabled()) notFound()

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <main className="flex flex-1 flex-col">
        {children}
      </main>
      <footer className="border-t border-gray-100 py-2 text-center text-xs text-gray-400">
        Powered by Prezva
      </footer>
    </div>
  )
}
