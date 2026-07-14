import { describe, it, expect } from 'vitest'
import { GHL_STAGE_IDS, GHL_STAGE_TAGS, GHL_LIFECYCLE_TAGS } from '@/lib/integrations/ghl/config'

describe('GHL config — attended session tag', () => {
  it('maps the attendedSession stage to the prezva-attended tag', () => {
    expect(GHL_LIFECYCLE_TAGS.attended).toBe('prezva-attended')
    expect(GHL_STAGE_TAGS[GHL_STAGE_IDS.attendedSession]).toBe('prezva-attended')
  })
})
