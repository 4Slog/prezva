export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--pz-bg)' }}
    >
      <div className="mb-8 flex items-center gap-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          P
        </div>
        <span className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Prezva</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-xs" style={{ color: 'var(--pz-label)' }}>
        &copy; {new Date().getFullYear()} Prezva. All rights reserved.
      </p>
    </div>
  )
}
