import Link from 'next/link'

export const metadata = { title: 'Terms of Service — Prezva' }

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: `By accessing or using Prezva ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service. These terms apply to all organizers, attendees, and visitors who access the Service.`,
  },
  {
    title: '2. Description of Service',
    body: `Prezva provides event management software including event creation, ticket sales, attendee registration, check-in tools, and related analytics. Prezva is a platform — we facilitate connections between event organizers and attendees but are not a party to any event transaction.`,
  },
  {
    title: '3. Account Registration',
    body: `You must create an account to use most features of Prezva. You agree to provide accurate, current, and complete information and to keep your account credentials secure. You are responsible for all activity that occurs under your account.

You must be at least 18 years old to create an account. Organizations may designate multiple users under a single organization account.`,
  },
  {
    title: '4. Payments and Fees',
    body: `Prezva charges a platform fee on paid ticket transactions. The current fee schedule is displayed on our pricing page. Fees are deducted automatically from payouts via Stripe Connect.

Payouts are sent directly to your connected bank account. Prezva does not hold event funds — all payments flow through Stripe. You are responsible for any taxes applicable to your events.

Refund policies for attendees are set by the event organizer. Prezva may step in to enforce refunds in cases of event cancellation or fraud.`,
  },
  {
    title: '5. Organizer Responsibilities',
    body: `As an event organizer, you are solely responsible for the events you create and manage through Prezva. This includes compliance with applicable laws, accurate event descriptions, honoring the ticket terms you publish, and delivering the event as advertised.

You agree not to use Prezva to conduct fraudulent, deceptive, or illegal events. Prezva reserves the right to remove events and suspend accounts that violate these terms.`,
  },
  {
    title: '6. Prohibited Uses',
    body: `You agree not to: (a) use the Service for any unlawful purpose; (b) transmit spam or unsolicited communications; (c) attempt to gain unauthorized access to any part of the Service; (d) scrape, crawl, or data-mine the Service without written permission; (e) resell or sublicense the Service without authorization; (f) impersonate any person or entity.`,
  },
  {
    title: '7. Intellectual Property',
    body: `Prezva and its licensors own all intellectual property rights in the Service, including software, design, trademarks, and content. You are granted a limited, non-exclusive, non-transferable license to use the Service for its intended purpose.

You retain ownership of content you upload (event descriptions, images, attendee data). By uploading content, you grant Prezva a license to display and process it to operate the Service.`,
  },
  {
    title: '8. Data and Privacy',
    body: `Your use of the Service is also governed by our Privacy Policy, which is incorporated into these Terms by reference. You are responsible for ensuring your use of attendee data complies with applicable privacy laws including GDPR and CCPA.`,
  },
  {
    title: '9. Disclaimers',
    body: `THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. PREZVA DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR MEET YOUR SPECIFIC REQUIREMENTS. TO THE FULLEST EXTENT PERMITTED BY LAW, PREZVA DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED.`,
  },
  {
    title: '10. Limitation of Liability',
    body: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, PREZVA SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE. PREZVA'S TOTAL LIABILITY SHALL NOT EXCEED THE GREATER OF $100 OR THE AMOUNT YOU PAID TO PREZVA IN THE 12 MONTHS PRECEDING THE CLAIM.`,
  },
  {
    title: '11. Termination',
    body: `Either party may terminate your account at any time. Upon termination, your right to use the Service ceases immediately. Prezva may suspend or terminate accounts that violate these Terms without prior notice.

Sections 7, 9, 10, and 12 survive termination.`,
  },
  {
    title: '12. Governing Law',
    body: `These Terms are governed by the laws of the State of Georgia, United States, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Fulton County, Georgia, and you consent to personal jurisdiction there.`,
  },
  {
    title: '13. Changes to Terms',
    body: `We reserve the right to modify these Terms at any time. We will provide notice of material changes via email or in-app notification at least 14 days before the changes take effect. Continued use of the Service after the effective date constitutes acceptance of the new Terms.`,
  },
  {
    title: '14. Contact',
    body: `For questions about these Terms, contact us at legal@prezva.app.`,
  },
]

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>Terms of Service</h1>
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
          <Link href="/privacy" className="hover:underline" style={{ color: 'var(--pz-muted)' }}>Privacy</Link>
          {' · '}
          <Link href="/" className="hover:underline" style={{ color: 'var(--pz-muted)' }}>Home</Link>
        </p>
      </footer>
    </div>
  )
}
