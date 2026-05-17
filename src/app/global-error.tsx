'use client'
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html>
      <body style={{ margin: 0, background: '#0D1B2A', fontFamily: 'sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#F0F4F8' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Critical error</h2>
            <p style={{ fontSize: 14, color: '#94A3B8', marginBottom: 24 }}>The application encountered a fatal error.</p>
            <button onClick={reset} style={{ background: '#00BFA6', color: '#0D1B2A', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}>
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
