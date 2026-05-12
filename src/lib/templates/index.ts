export type { TemplateSurface, SurveyTemplate, BadgeTemplate, EventTemplate, AnnouncementTemplate, IcebreakerPrompt, TriviaQuestion, OrgTemplate } from './types'
export { SURVEY_TEMPLATES } from './surveys'
export { BADGE_TEMPLATES } from './badges'
export { EVENT_TEMPLATES } from './events'
export { ANNOUNCEMENT_TEMPLATES } from './announcements'
export { ICEBREAKER_PROMPTS } from './icebreakers'
export { TRIVIA_QUESTIONS } from './trivia'

import type { TemplateSurface } from './types'
import { SURVEY_TEMPLATES } from './surveys'
import { BADGE_TEMPLATES } from './badges'
import { EVENT_TEMPLATES } from './events'
import { ANNOUNCEMENT_TEMPLATES } from './announcements'
import { ICEBREAKER_PROMPTS } from './icebreakers'
import { TRIVIA_QUESTIONS } from './trivia'

const GLOBAL_TEMPLATES: Record<TemplateSurface, unknown[]> = {
  survey: SURVEY_TEMPLATES,
  badge: BADGE_TEMPLATES,
  event: EVENT_TEMPLATES,
  announcement: ANNOUNCEMENT_TEMPLATES,
  icebreaker: ICEBREAKER_PROMPTS,
  trivia: TRIVIA_QUESTIONS,
}

export function getGlobalTemplates(surface: TemplateSurface) {
  return GLOBAL_TEMPLATES[surface] ?? []
}
