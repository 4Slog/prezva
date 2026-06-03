import Image from 'next/image'
import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--pz-bg)' }}
    >
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/">
          <Image src="/logo-dark.svg" alt="Prezva" width={148} height={28} />
        </Link>
        <Link
          href="/"
          className="text-sm transition-colors"
          style={{ color: 'var(--pz-muted)' }}
        >
          ← Back to home
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  )
}
