import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — Prezva' }

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body: `We collect information you provide directly to us when you create an account, organize events, or contact us for support. This includes your name, email address, organization details, and payment information processed through Stripe. We also collect event attendee data (names, emails, ticket selections) that you submit on behalf of your events.

We automatically collect certain technical information when you use Prezva, including IP addresses, browser type, device identifiers, and usage data through cookies and similar technologies.`,
  },
  {
    title: '2. How We Use Your Information',
    body: `We use the information we collect to provide, maintain, and improve the Prezva platform; process transactions and send related information; send administrative messages, updates, and security alerts; respond to your comments and questions; and comply with legal obligations.

We do not sell your personal information or your attendees' personal information to third parties.`,
  },
  {
    title: '3. Payments and Financial Data',
    body: `Prezva uses Stripe Connect to process payments. Payment card data is handled directly by Stripe and is never stored on Prezva servers. Payouts go directly from event ticket sales to your connected bank account. Stripe's privacy policy governs the handling of financial data.`,
  },
  {
    title: '4. Data Sharing',
    body: `We share your information with third-party service providers that perform services on our behalf (hosting, analytics, email delivery, payment processing). These providers are contractually required to protect your information.

We may disclose your information if required by law or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.`,
  },
  {
    title: '5. Data Retention',
    body: `We retain your account information for as long as your account is active. Event attendee data is retained for 24 months after the event date, after which it is deleted. You may request deletion of your account and associated data at any time by contacting support@prezva.app.`,
  },
  {
    title: '6. Your Rights (GDPR / CCPA)',
    body: `Depending on your location, you may have rights to access, correct, or delete personal data we hold about you; restrict or object to certain processing; and receive a copy of your data in a portable format.

To exercise any of these rights, contact us at privacy@prezva.app. We will respond within 30 days.`,
  },
  {
    title: '7. Cookies',
    body: `Prezva uses strictly necessary session cookies to keep you signed in. We do not use tracking or advertising cookies. You can control cookie settings through your browser, though disabling session cookies will prevent you from staying signed in.`,
  },
  {
    title: '8. Security',
    body: `We implement industry-standard security measures including TLS encryption in transit, encrypted storage at rest, and access controls. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.`,
  },
  {
    title: '9. Children',
    body: `Prezva is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, contact us and we will delete it.`,
  },
  {
    title: '10. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a notice on our platform. Continued use of Prezva after changes constitutes acceptance of the updated policy.`,
  },
  {
    title: '11. Contact',
    body: `For privacy-related questions or requests, contact us at privacy@prezva.app.`,
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--pz-bg)' }}>
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[#1E3A5F]">
        <Link href="/" className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            P
          </div>
          <span className="text-lg font-bold text-[#F0F4F8]">Prezva</span>
        </Link>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>Privacy Policy</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--pz-label)' }}>Last updated: May 2025</p>

        {SECTIONS.map((section) => (
          <section key={section.title} className="mb-8">
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>
              {section.title}
            </h2>
            {section.body.split('\n\n').map((para, i) => (
              <p key={i} className="text-sm leading-relaxed mb-3" style={{ color: 'var(--pz-muted)' }}>
                {para}
              </p>
            ))}
          </section>
        ))}
      </main>

      <footer className="border-t px-6 py-6 text-center" style={{ borderColor: 'var(--pz-border)' }}>
        <p className="text-xs" style={{ color: 'var(--pz-label)' }}>
          © {new Date().getFullYear()} Prezva.{' '}
          <Link href="/terms" className="hover:underline" style={{ color: 'var(--pz-muted)' }}>Terms</Link>
          {' · '}
          <Link href="/" className="hover:underline" style={{ color: 'var(--pz-muted)' }}>Home</Link>
        </p>
      </footer>
    </div>
  )
}
