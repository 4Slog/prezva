import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Help Center' }

const SECTIONS = [
  {
    heading: 'Getting started',
    items: [
      { q: 'How do I create an organization?', a: 'Click "New Organization" from the dashboard. Choose a unique slug — this forms part of your event URLs and cannot be changed later.' },
      { q: 'How do I invite team members?', a: 'Go to your organization settings → Team & Roles → Invite Member. They will receive an email with a join link. Roles: Admin (full access), Staff (check-in + view only).' },
      { q: 'How do I create my first event?', a: 'From your org dashboard, click "New Event." Fill in the title, date/time, and location. Events start in Draft status — publish when ready to accept registrations.' },
    ],
  },
  {
    heading: 'Registration & tickets',
    items: [
      { q: 'How do I set up paid tickets?', a: 'Create a ticket type with a price. You will need to connect a Stripe account first (Settings → Payments). Prezva charges 2% platform fee on paid tickets.' },
      { q: 'Can I create discount codes?', a: 'Yes — in the Tickets section of your event, scroll to Discount Codes. You can create percentage or fixed-amount codes with optional expiry dates and usage limits.' },
      { q: 'How do I set event capacity?', a: 'When creating or editing your event, set the Capacity field. You can also enable the waitlist so attendees are automatically queued when the event fills.' },
      { q: 'What is a member-only ticket?', a: "If you have connected an association integration (WildApricot, iMIS, etc.), you can mark a ticket type as members only. Registrants' membership will be verified automatically at checkout." },
    ],
  },
  {
    heading: 'Check-in',
    items: [
      { q: 'How does QR code check-in work?', a: "Each confirmed registration gets a unique QR code. On event day, open the Check-In tab — it activates the camera scanner. Scan the attendee's QR code to check them in instantly." },
      { q: 'Does check-in work offline?', a: 'Yes. The check-in scanner stores scans locally (IndexedDB) if you lose internet, then syncs automatically when reconnected. The sync health pill in the sidebar shows pending syncs.' },
      { q: 'Can multiple staff scan at the same time?', a: 'Yes — multiple check-in stations can run simultaneously. They all sync to the same event in real time.' },
    ],
  },
  {
    heading: 'Badges & certificates',
    items: [
      { q: 'How do I print badges?', a: 'Go to your event → Badges, choose a template (portrait, landscape, or thermal ZPL), and click Print All or reprint individual badges. Thermal-compatible templates work with Zebra ZPL printers. Color templates require a standard inkjet or laser printer.' },
      { q: 'How do I issue CE credit certificates?', a: 'Enable CE Credits on your event settings page, set the credit hours, and certificates are generated automatically for attendees who met the attendance threshold. Each certificate includes a public verification URL.' },
      { q: 'Can I add a signature or logo to certificates?', a: 'Yes — upload your organization logo under Org Settings → Branding. For signatures, upload a signature image when configuring the certificate template for the event.' },
    ],
  },
  {
    heading: 'Integrations',
    items: [
      { q: 'Which integrations are available?', a: 'Prezva integrates with: Zoom, Microsoft Teams, Outlook Calendar, Google Drive, SharePoint, Mailchimp, Constant Contact, Google Forms, Eventbrite, and 7 association management systems (WildApricot, iMIS, MemberClicks, YourMembership, Glue Up, Neon, Novi).' },
      { q: 'How do I connect an integration?', a: 'Go to your organization → Integrations tab. Click Connect on any provider. You will be redirected to authorize access. Tokens are encrypted and stored securely.' },
      { q: 'Which integrations support membership verification?', a: 'WildApricot, iMIS, MemberClicks, YourMembership, Glue Up, Neon, and Novi all support membership verification for member-only tickets.' },
    ],
  },
  {
    heading: 'Billing',
    items: [
      { q: 'How does Prezva billing work?', a: "Prezva charges 2% on paid ticket revenue, deducted from payouts. Free events are always free. Connect your Stripe account in Settings → Payments to receive payouts." },
      { q: 'When do I get paid?', a: "Stripe handles payouts on your normal payout schedule (typically 2 business days after a charge). Prezva's fee is deducted automatically via Stripe Connect." },
      { q: 'Can I pass fees to attendees?', a: 'Yes — when creating a paid ticket type, enable "Pass fees to attendees." The displayed price will include the 2% platform fee.' },
    ],
  },
  {
    heading: 'Mobile app',
    items: [
      { q: 'Is there a mobile app?', a: 'Prezva is a Progressive Web App (PWA). On iOS, tap Share → Add to Home Screen. On Android, tap the browser menu → Install app. The native Expo app is coming soon to the App Store and Google Play.' },
      { q: 'How do I enable push notifications?', a: 'When you access an event page on your phone, the browser will prompt you to allow notifications. Accept to receive announcement pushes from event organizers.' },
    ],
  },
  {
    heading: 'Privacy & GDPR',
    items: [
      { q: 'How do I download my data?', a: 'Go to Account Settings → Privacy → Download your data. You will receive a JSON file containing all your registrations, messages, and survey responses.' },
      { q: 'How do I delete my account?', a: 'Go to Account Settings → Privacy → Delete my data. This anonymizes your registrations (payment records are retained for legal compliance) and permanently deletes your messages and survey responses.' },
    ],
  },
]

export default function HelpPage() {
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-[var(--pz-text)]">Help Center</h1>
        <p className="text-sm text-[var(--pz-muted)] mt-1">Answers to common questions about using Prezva.</p>
      </div>
      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <h2 className="text-xs font-semibold text-[var(--pz-teal-ink)] uppercase tracking-wider mb-3">
            {section.heading}
          </h2>
          <div className="space-y-2">
            {section.items.map(({ q, a }) => (
              <details
                key={q}
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--pz-border)', background: 'var(--pz-surface)' }}
              >
                <summary
                  className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-[var(--pz-text)] text-left hover:bg-[var(--pz-surface-2)] transition-colors list-none"
                >
                  {q}
                  <span className="ml-4 text-[var(--pz-muted)] text-lg leading-none flex-shrink-0 select-none">+</span>
                </summary>
                <p className="px-4 pb-4 text-xs text-[var(--pz-muted)] leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
