import { notFound } from 'next/navigation'

// O169 / H-R2: volunteer self-signup is closed for launch. Organizers invite
// volunteers from the dashboard or the embedded app; the application and
// approval flow is O175.
export default function VolunteerSignupPage() {
  notFound()
}
