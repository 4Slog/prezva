import type { ReactNode } from 'react'

interface PortalShellProps {
  eventName: string
  portalLabel: string
  entityName?: string
  entityDetail?: string
  entityLogoUrl?: string
  exitHref?: string
  children: ReactNode
}

export function PortalShell({
  eventName,
  portalLabel,
  entityName,
  entityDetail,
  entityLogoUrl,
  exitHref,
  children,
}: PortalShellProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'var(--pz-surface)',
          borderBottom: '1px solid var(--pz-border)',
          padding: '0.625rem 1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--pz-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                margin: 0,
              }}
            >
              {eventName}
            </p>
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--pz-text)',
                margin: '2px 0 0',
              }}
            >
              {portalLabel}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {entityLogoUrl && (
              <img
                src={entityLogoUrl}
                alt={entityName ?? portalLabel}
                style={{
                  height: 28,
                  width: 'auto',
                  objectFit: 'contain',
                  borderRadius: 4,
                  background: 'var(--pz-surface-2)',
                  padding: 2,
                  border: '1px solid var(--pz-border)',
                }}
              />
            )}
            {entityName && (
              <div style={{ textAlign: 'right' }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--pz-text)',
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {entityName}
                </p>
                {entityDetail && (
                  <p
                    style={{
                      fontSize: 11,
                      color: 'var(--pz-muted)',
                      margin: 0,
                    }}
                  >
                    {entityDetail}
                  </p>
                )}
              </div>
            )}
            {exitHref && (
              <a
                href={exitHref}
                style={{
                  fontSize: 12,
                  color: 'var(--pz-teal-ink)',
                  textDecoration: 'none',
                  fontWeight: 500,
                  paddingLeft: 10,
                  marginLeft: 2,
                  borderLeft: '1px solid var(--pz-border)',
                  whiteSpace: 'nowrap',
                }}
              >
                ← Dashboard
              </a>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}

export default PortalShell
