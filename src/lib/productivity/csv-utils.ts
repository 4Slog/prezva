const FIELD_SYNONYMS: Record<string, string[]> = {
  title: ['title', 'session title', 'session name', 'name', 'topic', 'subject'],
  description: ['description', 'desc', 'details', 'abstract', 'summary', 'body'],
  starts_at: ['starts at', 'start time', 'start', 'begins', 'begin', 'start date', 'from'],
  ends_at: ['ends at', 'end time', 'end', 'finish', 'to', 'end date', 'until'],
  session_type: ['type', 'session type', 'format', 'category', 'kind'],
  track: ['track', 'track name', 'stream', 'room track'],
  room: ['room', 'room name', 'location', 'venue', 'space', 'hall'],
  speaker: ['speaker', 'speaker name', 'presenter', 'host', 'facilitator'],
  capacity: ['capacity', 'seats', 'max attendees', 'limit', 'max'],
  attendee_name: ['name', 'full name', 'attendee name', 'attendee', 'participant', 'first name'],
  attendee_email: ['email', 'e-mail', 'email address', 'attendee email', 'mail'],
  company: ['company', 'organization', 'organisation', 'employer', 'firm'],
  job_title: ['job title', 'title', 'position', 'role', 'job role'],
  phone: ['phone', 'telephone', 'mobile', 'cell', 'phone number'],
}

export function detectCsvColumns(headers: string[]): Record<string, { field: string; confidence: number }> {
  const result: Record<string, { field: string; confidence: number }> = {}
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim())

  for (let i = 0; i < headers.length; i++) {
    const h = normalizedHeaders[i]
    let bestField = ''
    let bestConfidence = 0

    for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
      if (synonyms[0] === h) {
        if (1.0 > bestConfidence) { bestField = field; bestConfidence = 1.0 }
      } else if (synonyms.includes(h)) {
        if (0.8 > bestConfidence) { bestField = field; bestConfidence = 0.8 }
      } else if (synonyms.some(s => h.includes(s) || s.includes(h))) {
        if (0.5 > bestConfidence) { bestField = field; bestConfidence = 0.5 }
      }
    }

    if (bestField) {
      result[headers[i]] = { field: bestField, confidence: bestConfidence }
    }
  }

  return result
}
