// <option>s for an event timezone <select>. The event's current zone is always
// offered — a zone outside the short list is prepended — so saving the form never
// silently switches the event to the first listed zone.

export const LISTED_TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (ET)' },
  { value: 'America/Chicago',     label: 'Central (CT)' },
  { value: 'America/Denver',      label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'UTC',                 label: 'UTC' },
]

export function TimezoneOptions({ current }: { current: string | null | undefined }) {
  return (
    <>
      {current && !LISTED_TIMEZONES.some(tz => tz.value === current) && (
        <option value={current}>{current}</option>
      )}
      {LISTED_TIMEZONES.map(tz => (
        <option key={tz.value} value={tz.value}>{tz.label}</option>
      ))}
    </>
  )
}
