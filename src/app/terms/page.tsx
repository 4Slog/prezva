export const metadata = { title: 'Terms of Service — Prezva' }

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--pz-bg)' }}>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>Terms of Service</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--pz-muted)' }}>Last updated: May 30, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--pz-muted)' }}>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Acceptance of Terms</h2>
            <p>By accessing or using Prezva, you agree to be bound by these Terms of Service. If you do not agree, please do not use our platform.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Use of Service</h2>
            <p>Prezva provides event management software. You are responsible for all content you upload and all activities that occur under your account. You may not use Prezva for illegal purposes or to violate the rights of others.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Payments</h2>
            <p>Ticket payments are processed via Stripe Connect and go directly to event organizers. Prezva does not hold funds. Refund policies are set by individual event organizers.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Limitation of Liability</h2>
            <p>Prezva is provided &quot;as is&quot; without warranty of any kind. Our liability is limited to the amount you paid for the service in the 12 months prior to the claim.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>SMS / Text Messaging</h2>
            <p>By opting in to Prezva SMS notifications (via the registration consent checkbox or by texting START or YES), you agree to receive recurring automated text messages related to events you register for. Consent is not a condition of purchase. Message frequency varies; message and data rates may apply. Reply STOP or UNSUBSCRIBE to cancel, or HELP for assistance. Carriers are not liable for delayed or undelivered messages.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Contact</h2>
            <p>For questions about these terms, contact <a href="mailto:legal@prezva.app" style={{ color: 'var(--pz-teal)' }}>legal@prezva.app</a>.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
