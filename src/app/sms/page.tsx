export const metadata = { title: 'SMS Messaging Program — Prezva' }

export default function SmsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--pz-bg)' }}>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>SMS Messaging Program</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--pz-text-muted)' }}>Last updated: May 30, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--pz-text-muted)' }}>
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Overview</h2>
            <p>Prezva sends event notifications by SMS to attendees who opt in. Messages relate only to events you register for.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>How to Opt In</h2>
            <p>Check the SMS consent box and provide your mobile number when registering at <a href="https://prezva.app" style={{ color: 'var(--pz-teal)' }}>prezva.app</a>, or text START or YES to our number.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Message Types &amp; Frequency</h2>
            <p>You may receive session reminders, schedule changes, day-of announcements, and check-in confirmations. Frequency varies by event. Message and data rates may apply.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Opt Out / Help</h2>
            <p>Reply <strong style={{ color: 'var(--pz-text)' }}>STOP</strong> or <strong style={{ color: 'var(--pz-text)' }}>UNSUBSCRIBE</strong> to stop messages; reply <strong style={{ color: 'var(--pz-text)' }}>HELP</strong> for help, or contact <a href="mailto:ssss.logistics.llc@gmail.com" style={{ color: 'var(--pz-teal)' }}>ssss.logistics.llc@gmail.com</a>.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Sample Messages</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>&ldquo;Your session starts in 30 minutes. Tap here to join: [link] Reply STOP to opt out.&rdquo;</li>
              <li>&ldquo;Session change — Keynote is now in Room B. See you there. Reply STOP to opt out.&rdquo;</li>
              <li>&ldquo;You&rsquo;re checked in to [Event]. Welcome! Reply STOP to opt out.&rdquo;</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Privacy</h2>
            <p>
              No mobile information is sold or shared with third parties for marketing. See our{' '}
              <a href="/privacy" style={{ color: 'var(--pz-teal)' }}>Privacy Policy</a> and{' '}
              <a href="/terms" style={{ color: 'var(--pz-teal)' }}>Terms of Service</a> for full details.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
