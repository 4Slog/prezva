export const metadata = { title: 'Privacy Policy — Prezva' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--pz-bg)' }}>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>Privacy Policy</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--pz-muted)' }}>Last updated: May 30, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--pz-muted)' }}>
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
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>SMS / Text Messaging</h2>
            <p>Prezva offers SMS text-message notifications to event attendees who opt in. You can opt in by checking the SMS consent box when you register for an event and providing your mobile number, or by texting START or YES to our number. By opting in, you consent to receive recurring automated text messages from Prezva about the event(s) you register for — such as session reminders, schedule changes, day-of announcements, and check-in confirmations. Consent is not a condition of purchase or registration. Message frequency varies. Message and data rates may apply. Reply STOP or UNSUBSCRIBE at any time to opt out, or reply HELP for help.</p>
            <p className="mt-3">No mobile information will be sold, rented, or shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties. We share mobile information only with service providers that help us deliver the messaging service (such as our messaging provider), solely to send the messages you have requested.</p>
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
