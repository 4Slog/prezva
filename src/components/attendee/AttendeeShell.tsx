'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Calendar,
  Users,
  MessageSquare,
  Grid3x3,
  MoreHorizontal,
  QrCode,
  User,
  Mic,
  Star,
  Camera,
  HelpCircle,
  Trophy,
  MapPin,
  Zap,
  Layers,
  Heart,
  BookOpen,
  Award,
  UserCog,
  X,
} from 'lucide-react'

interface AttendeeShellEvent {
  title: string
  slug: string
  certificate_enabled?: boolean
  organizations?: { logo_url?: string | null; name?: string | null } | null
}

interface AttendeeShellProps {
  event: AttendeeShellEvent
  hasRegistration: boolean
  children: React.ReactNode
}

const TAB_BAR_HEIGHT = 64

export function AttendeeShell({ event, hasRegistration, children }: AttendeeShellProps) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const [meOpen, setMeOpen] = useState(false)
  const { slug } = event
  const base = `/e/${slug}`

  const noShell =
    pathname === `${base}/register` ||
    pathname === `${base}/confirmation` ||
    /^\/e\/[^/]+\/sessions\/[^/]+\/live$/.test(pathname)

  if (noShell) return <>{children}</>

  const TABS = [
    { id: 'home',      label: 'Home',      href: base,               icon: Home },
    { id: 'agenda',    label: 'Agenda',    href: `${base}/agenda`,    icon: Calendar },
    { id: 'people',    label: 'People',    href: `${base}/people`,    icon: Users },
    { id: 'community', label: 'Community', href: `${base}/community`, icon: MessageSquare },
  ]

  const MORE_ITEMS = [
    { label: 'Speakers',    href: `${base}/speakers`,    icon: Mic },
    { label: 'Sponsors',    href: `${base}/sponsors`,    icon: Star },
    { label: 'Photos',      href: `${base}/photos`,      icon: Camera },
    { label: 'Trivia',      href: `${base}/trivia`,      icon: HelpCircle },
    { label: 'Leaderboard', href: `${base}/leaderboard`, icon: Trophy },
    { label: 'Passport',    href: `${base}/passport`,    icon: MapPin },
    { label: 'Icebreakers', href: `${base}/icebreakers`, icon: Zap },
    { label: 'Groups',      href: `${base}/groups`,      icon: Layers },
    { label: 'Volunteer',   href: `${base}/volunteer`,   icon: Heart },
  ]

  const ME_ITEMS = [
    { label: 'My QR',        href: `${base}/my-qr`,        icon: QrCode },
    { label: 'My Agenda',    href: `${base}/my-agenda`,    icon: BookOpen },
    ...(event.certificate_enabled
      ? [{ label: 'Certificate', href: `${base}/certificate`, icon: Award }]
      : []),
    { label: 'Edit Profile', href: `${base}/profile/edit`, icon: UserCog },
  ]

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  const isMoreActive = MORE_ITEMS.some(item => isActive(item.href))

  return (
    <>
      <style>{`
        .pz-a-nav { display: none; }
        .pz-a-tabs { display: flex; }
        .pz-a-content { padding-bottom: ${TAB_BAR_HEIGHT + 8}px; }
        @media (min-width: 768px) {
          .pz-a-nav { display: flex; }
          .pz-a-tabs { display: none; }
          .pz-a-content { padding-bottom: 0; }
        }
      `}</style>

      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          height: 52,
          background: 'var(--pz-surface)',
          borderBottom: '1px solid var(--pz-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 1rem',
        }}
      >
        {/* Left — event logo or name linking to event home */}
        <Link
          href={base}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            color: 'var(--pz-text)',
            fontWeight: 700,
            fontSize: 15,
            flexShrink: 0,
            maxWidth: 200,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {event.organizations?.logo_url ? (
            <img
              src={event.organizations.logo_url}
              alt={event.organizations.name ?? event.title}
              style={{ height: 28, maxWidth: 100, objectFit: 'contain', flexShrink: 0 }}
            />
          ) : (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</span>
          )}
        </Link>

        {/* Desktop inline nav — centered */}
        <nav
          className="pz-a-nav"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}
        >
          {TABS.map(t => {
            const active = t.id === 'home' ? isActive(t.href, true) : isActive(t.href)
            return (
              <Link
                key={t.id}
                href={t.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--pz-teal-ink)' : 'var(--pz-text)',
                  background: active ? 'rgba(45,212,191,0.10)' : 'transparent',
                  textDecoration: 'none',
                }}
              >
                <t.icon size={14} />
                {t.label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: isMoreActive ? 600 : 400,
              color: isMoreActive ? 'var(--pz-teal-ink)' : 'var(--pz-text)',
              background: isMoreActive ? 'rgba(45,212,191,0.10)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Grid3x3 size={14} />
            More
          </button>
        </nav>

        {/* Right — QR quick-link + Me menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <Link
            href={`${base}/my-qr`}
            aria-label="My QR code"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 8,
              color: 'var(--pz-muted)',
              textDecoration: 'none',
            }}
          >
            <QrCode size={18} />
          </Link>

          {hasRegistration && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMeOpen(v => !v)}
                aria-label="Me menu"
                aria-expanded={meOpen}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'var(--pz-surface-2)',
                  border: '1px solid var(--pz-border)',
                  color: 'var(--pz-text)',
                  cursor: 'pointer',
                }}
              >
                <User size={16} />
              </button>

              {meOpen && (
                <>
                  {/* backdrop — click to close */}
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                    onClick={() => setMeOpen(false)}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      zIndex: 50,
                      background: 'var(--pz-surface)',
                      border: '1px solid var(--pz-border)',
                      borderRadius: 10,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                      minWidth: 180,
                      padding: '6px 0',
                    }}
                  >
                    {ME_ITEMS.map(item => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMeOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 16px',
                          fontSize: 13,
                          color: 'var(--pz-text)',
                          textDecoration: 'none',
                        }}
                      >
                        <item.icon size={15} style={{ color: 'var(--pz-muted)', flexShrink: 0 }} />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── PAGE CONTENT ───────────────────────────────────────────────────── */}
      <div className="pz-a-content">{children}</div>

      {/* ── MOBILE BOTTOM TAB BAR ──────────────────────────────────────────── */}
      <nav
        className="pz-a-tabs"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          height: TAB_BAR_HEIGHT,
          background: 'var(--pz-surface)',
          borderTop: '1px solid var(--pz-border)',
          alignItems: 'stretch',
        }}
      >
        {TABS.map(t => {
          const active = t.id === 'home' ? isActive(t.href, true) : isActive(t.href)
          return (
            <Link
              key={t.id}
              href={t.href}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                textDecoration: 'none',
                color: active ? 'var(--pz-teal-ink)' : 'var(--pz-muted)',
                fontSize: 10,
                fontWeight: active ? 600 : 400,
              }}
            >
              <t.icon size={20} />
              {t.label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: isMoreActive ? 'var(--pz-teal-ink)' : 'var(--pz-muted)',
            fontSize: 10,
            fontWeight: isMoreActive ? 600 : 400,
          }}
        >
          <MoreHorizontal size={20} />
          More
        </button>
      </nav>

      {/* ── MORE SHEET ─────────────────────────────────────────────────────── */}
      {moreOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)' }}
            onClick={() => setMoreOpen(false)}
          />
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 51,
              background: 'var(--pz-surface)',
              borderRadius: '16px 16px 0 0',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px 12px',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--pz-text)' }}>More</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--pz-muted)',
                  padding: 4,
                  display: 'flex',
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                padding: '0 16px 24px',
              }}
            >
              {MORE_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 7,
                    padding: '14px 8px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    color: 'var(--pz-text)',
                    background: 'var(--pz-surface-2)',
                    fontSize: 12,
                    fontWeight: 500,
                    textAlign: 'center',
                  }}
                >
                  <item.icon size={22} style={{ color: 'var(--pz-teal-ink)' }} />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
