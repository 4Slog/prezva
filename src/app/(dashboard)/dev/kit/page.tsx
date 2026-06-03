'use client'

import { useState } from 'react'
import {
  CalendarDays,
  Settings,
  Users,
  BarChart2,
  Ticket,
  FileText,
  Globe,
  Bell,
  PackageOpen,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageNav } from '@/components/ui/PageNav'
import { SideNav } from '@/components/ui/SideNav'
import type { SideNavGroup } from '@/components/ui/SideNav'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge, StatusBadgeCluster } from '@/components/ui/StatusBadge'
import { ToastProvider, useToast } from '@/components/ui/Toast'

const NAV_GROUPS: SideNavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: BarChart2,
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Analytics', href: '/analytics' },
    ],
  },
  {
    id: 'events',
    label: 'Events',
    icon: CalendarDays,
    items: [
      { label: 'All Events', href: '/events', icon: CalendarDays },
      { label: 'Tickets', href: '/tickets', icon: Ticket },
    ],
  },
  {
    id: 'people',
    label: 'People',
    icon: Users,
    items: [
      { label: 'Attendees', href: '/attendees' },
      { label: 'Staff', href: '/staff' },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    icon: FileText,
    items: [
      { label: 'Pages', href: '/pages', icon: Globe },
      { label: 'Announcements', href: '/announcements', icon: Bell },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    items: [
      { label: 'General', href: '/settings' },
      { label: 'Integrations', href: '/integrations' },
    ],
  },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--pz-label)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function KitDemo() {
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [fieldValue, setFieldValue] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [navCollapsed, setNavCollapsed] = useState(false)

  return (
    <div className="max-w-3xl space-y-12 pb-16">

      {/* ── PageNav ────────────────────────────────────────────────────────── */}
      <Section title="PageNav">
        <PageNav
          home="/dashboard"
          trail={[
            { label: 'Events', href: '/events' },
            { label: 'Spring Summit', href: '/events/spring-summit' },
            { label: 'Settings' },
          ]}
        />
      </Section>

      {/* ── PageHeader ─────────────────────────────────────────────────────── */}
      <Section title="PageHeader">
        <PageHeader
          title="Spring Economic Summit"
          subtitle="May 14–16 · Birmingham, AL · 420 registered"
          status={
            <StatusBadgeCluster>
              <StatusBadge tone="live" label="Live now" />
              <StatusBadge tone="success" label="Tickets open" />
            </StatusBadgeCluster>
          }
          actions={
            <>
              <Button variant="secondary" size="sm">Share</Button>
              <Button size="sm">Edit event</Button>
            </>
          }
        />
      </Section>

      {/* ── StatusBadge ────────────────────────────────────────────────────── */}
      <Section title="StatusBadge — all tones">
        <StatusBadgeCluster>
          <StatusBadge tone="live"    label="Live now" />
          <StatusBadge tone="success" label="Published" />
          <StatusBadge tone="warning" label="Pending review" />
          <StatusBadge tone="error"   label="Cancelled" />
          <StatusBadge tone="neutral" label="Draft" />
          <StatusBadge tone="info"    label="Scheduled" />
        </StatusBadgeCluster>
      </Section>

      {/* ── StatCards ──────────────────────────────────────────────────────── */}
      <Section title="StatCard">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Registered"
            value="420"
            delta={{ value: '+38 this week', direction: 'up' }}
            hint="Goal: 500"
          />
          <StatCard
            label="Check-ins"
            value="312"
            delta={{ value: '−5 vs. yesterday', direction: 'down' }}
          />
          <StatCard
            label="Sessions"
            value="18"
            delta={{ value: 'no change', direction: 'flat' }}
            hint="Across 3 tracks"
          />
        </div>
      </Section>

      {/* ── Field ──────────────────────────────────────────────────────────── */}
      <Section title="Field — helper / counter / error states">
        <div className="space-y-4 max-w-md">
          <Field label="Event name" htmlFor="event-name" required helper="Shown publicly on the registration page.">
            <input
              id="event-name"
              type="text"
              placeholder="e.g. Spring Economic Summit"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                background: 'var(--pz-surface)',
                border: '1px solid var(--pz-border)',
                color: 'var(--pz-text)',
                outline: 'none',
              }}
            />
          </Field>

          <Field
            label="Short description"
            htmlFor="desc"
            counter={{ value: fieldValue.length, max: 160 }}
          >
            <textarea
              id="desc"
              rows={3}
              value={fieldValue}
              onChange={e => setFieldValue(e.target.value)}
              placeholder="One or two sentences about this event…"
              className="w-full rounded-lg px-3 py-2 text-sm resize-none"
              style={{
                background: 'var(--pz-surface)',
                border: '1px solid var(--pz-border)',
                color: 'var(--pz-text)',
                outline: 'none',
              }}
            />
          </Field>

          <Field label="Location" htmlFor="location" error="Please enter a venue or select 'Virtual'.">
            <input
              id="location"
              type="text"
              placeholder="Venue name or address"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                background: 'var(--pz-surface)',
                border: '1px solid var(--pz-error-bg)',
                color: 'var(--pz-text)',
                outline: 'none',
              }}
            />
          </Field>
        </div>
      </Section>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      <Section title="Toast">
        <div className="flex flex-wrap gap-3">
          <Button size="sm" variant="secondary" onClick={() => toast({ variant: 'success', title: 'Changes saved', description: 'Your event settings have been updated.' })}>
            Success toast
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast({ variant: 'error', title: 'Something went wrong', description: 'Could not save. Please try again.' })}>
            Error toast
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast({ variant: 'info', title: 'Heads up', description: 'Registration closes in 2 days.' })}>
            Info toast
          </Button>
        </div>
      </Section>

      {/* ── SideNav ────────────────────────────────────────────────────────── */}
      <Section title="SideNav — expanded / collapsed rail">
        <div className="flex gap-4">
          <div className="rounded-xl overflow-hidden" style={{ height: 320, border: '1px solid var(--pz-border)' }}>
            <SideNav groups={NAV_GROUPS} collapsed={navCollapsed} />
          </div>
          <div className="flex flex-col justify-center">
            <Button size="sm" variant="secondary" onClick={() => setNavCollapsed(c => !c)}>
              {navCollapsed ? 'Expand' : 'Collapse'} rail
            </Button>
          </div>
        </div>
      </Section>

      {/* ── ConfirmDialog ──────────────────────────────────────────────────── */}
      <Section title="ConfirmDialog">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmOpen(true)}
        >
          Delete event…
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          title="Delete this event?"
          body="This will permanently remove Spring Economic Summit and all its data. Registered attendees will be notified. This cannot be undone."
          confirmLabel="Yes, delete"
          destructive
          onConfirm={() => {
            setConfirmOpen(false)
            toast({ variant: 'error', title: 'Event deleted' })
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      </Section>

      {/* ── EmptyState ─────────────────────────────────────────────────────── */}
      <Section title="EmptyState">
        <EmptyState
          icon={<PackageOpen size={36} />}
          title="No sessions yet"
          body="Add your first session to start building the agenda. Attendees will see sessions here once you publish."
          action={{ label: 'Add first session', onClick: () => toast({ variant: 'info', title: 'Add session clicked' }) }}
        />
      </Section>

    </div>
  )
}

export default function KitPage() {
  return (
    <ToastProvider>
      <KitDemo />
    </ToastProvider>
  )
}
