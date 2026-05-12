export const metadata = { title: 'Privacy Policy — Prezva' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--pz-bg)' }}>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>Privacy Policy</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--pz-text-muted)' }}>Last updated: May 12, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--pz-text-muted)' }}>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Information We Collect</h2>
            <p>We collect information you provide directly to us, such as when you create an account, register for an event, or contact us for support. This includes name, email address, and payment information for ticketed events.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>How We Use Your Information</h2>
            <p>We use the information we collect to provide, maintain, and improve our services, process transactions, send transactional and promotional communications, and comply with legal obligations.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Data Retention and Deletion</h2>
            <p>You may request deletion of your account and associated data at any time by contacting <a href="mailto:support@prezva.app" style={{ color: 'var(--pz-teal)' }}>support@prezva.app</a>. We retain event data for organizers for up to 2 years after the event date.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Contact</h2>
            <p>For privacy questions, contact us at <a href="mailto:privacy@prezva.app" style={{ color: 'var(--pz-teal)' }}>privacy@prezva.app</a>.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
